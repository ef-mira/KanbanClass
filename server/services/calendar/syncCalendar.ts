import ical, { type ParameterValue, type VEvent } from "node-ical";
import { prisma } from "../../db";
import type { SyncResult } from "../../../shared/types";
import { parseEventTexts } from "../ai/parseEvents";
import { assignSlots } from "../lessons";

const SUBJECT_PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#a855f7"];

interface RawInstance {
  externalId: string;
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
}

const text = (v: ParameterValue | undefined): string =>
  v == null ? "" : typeof v === "string" ? v : String((v as { val?: unknown }).val ?? "");

export async function fetchIcs(url: string): Promise<string> {
  const normalized = url.trim().replace(/^webcal:\/\//i, "https://");
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Calendar URL must be http(s) or webcal");
  const res = await fetch(parsed, { headers: { Accept: "text/calendar, */*" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Object.assign(new Error(`Calendar feed returned HTTP ${res.status}`), { status: 502 });
  const body = await res.text();
  if (!body.includes("BEGIN:VCALENDAR")) throw Object.assign(new Error("Response is not an iCal feed"), { status: 502 });
  return body;
}

export function expandIcs(ics: string, from: Date, to: Date): { instances: RawInstance[]; skippedAllDay: number } {
  const data = ical.sync.parseICS(ics);
  const instances: RawInstance[] = [];
  let skippedAllDay = 0;
  for (const comp of Object.values(data)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp as VEvent;
    if (ev.status === "CANCELLED") continue;
    for (const inst of ical.expandRecurringEvent(ev, { from, to })) {
      if (inst.isFullDay) {
        skippedAllDay++;
        continue;
      }
      const src = inst.event;
      if (src.status === "CANCELLED") continue;
      const start = new Date(inst.start);
      const end = inst.end ? new Date(inst.end) : new Date(start.getTime() + 45 * 60_000);
      instances.push({
        externalId: inst.isRecurring ? `${ev.uid}@${start.toISOString()}` : ev.uid,
        summary: text(inst.summary).trim(),
        description: text(src.description).trim(),
        location: text(src.location).trim(),
        start,
        end,
      });
    }
  }
  // Guard against feeds that reuse UIDs.
  const seen = new Map<string, number>();
  for (const i of instances) {
    const n = seen.get(i.externalId) ?? 0;
    seen.set(i.externalId, n + 1);
    if (n > 0) i.externalId = `${i.externalId}#${n}`;
  }
  return { instances, skippedAllDay };
}

export function syncWindow(settings: { schoolYearStart: Date | null; schoolYearEnd: Date | null } | null, now = new Date()) {
  const from = settings?.schoolYearStart ?? new Date(now.getFullYear() - (now.getMonth() >= 7 ? 0 : 1), 7, 1);
  const to = settings?.schoolYearEnd ?? new Date(from.getFullYear() + 1, 6, 31, 23, 59);
  return { from, to };
}

/**
 * Imports an iCal document for a user: expands recurrences, parses text fields
 * (AI with heuristic fallback), upserts events, creates subjects for new
 * courses, removes events that disappeared from the feed, and re-binds lessons
 * to slots.
 */
export async function syncCalendar(userId: string, ics: string): Promise<SyncResult> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const { from, to } = syncWindow(settings);
  const { instances, skippedAllDay } = expandIcs(ics, from, to);
  const warnings: string[] = [];
  if (skippedAllDay) warnings.push(`Skipped ${skippedAllDay} all-day entries (holidays, notices).`);

  const parse = await parseEventTexts(instances);
  warnings.push(...parse.warnings);

  // Subjects: match case-insensitively on name, create missing ones.
  const subjects = await prisma.subject.findMany({ where: { userId } });
  const subjectByKey = new Map(subjects.map((s) => [s.name.toLocaleLowerCase("da"), s]));
  let subjectsCreated = 0;
  for (const p of parse.results) {
    if (p.eventType !== "lesson" || !p.subject) continue;
    const key = p.subject.toLocaleLowerCase("da");
    if (subjectByKey.has(key)) continue;
    const s = await prisma.subject.create({
      data: { userId, name: p.subject, color: SUBJECT_PALETTE[subjectByKey.size % SUBJECT_PALETTE.length] },
    });
    subjectByKey.set(key, s);
    subjectsCreated++;
  }

  const existing = await prisma.calendarEvent.findMany({ where: { userId }, select: { id: true, externalId: true, subjectId: true } });
  const existingIds = new Map(existing.map((e) => [e.externalId, e]));
  const touchedSubjects = new Set<string>(existing.map((e) => e.subjectId).filter((x): x is string => !!x));
  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < instances.length; i++) {
        const inst = instances[i];
        const p = parse.results[i];
        const subjectId = p.eventType === "lesson" && p.subject ? (subjectByKey.get(p.subject.toLocaleLowerCase("da"))?.id ?? null) : null;
        if (subjectId) touchedSubjects.add(subjectId);
        const data = {
          summary: inst.summary,
          description: inst.description,
          location: inst.location,
          startTime: inst.start,
          endTime: inst.end,
          eventType: p.eventType,
          lessonType: p.eventType,
          subjectName: p.subject,
          group: p.group,
          room: p.room,
          isPause: p.isPause,
          subjectId,
        };
        if (existingIds.has(inst.externalId)) {
          await tx.calendarEvent.update({ where: { userId_externalId: { userId, externalId: inst.externalId } }, data });
          updated++;
        } else {
          await tx.calendarEvent.create({ data: { ...data, userId, externalId: inst.externalId } });
          created++;
        }
      }
    },
    { timeout: 120_000 },
  );

  const feedIds = new Set(instances.map((i) => i.externalId));
  const stale = existing.filter((e) => !feedIds.has(e.externalId)).map((e) => e.id);
  if (stale.length) await prisma.calendarEvent.deleteMany({ where: { id: { in: stale } } });

  let lessonsCreated = 0;
  for (const subjectId of touchedSubjects) {
    lessonsCreated += (await assignSlots(subjectId)).lessonsCreated;
  }

  const result: SyncResult = {
    fetched: instances.length,
    created,
    updated,
    removed: stale.length,
    subjectsCreated,
    lessonsCreated,
    aiParsed: parse.aiParsed,
    heuristicParsed: parse.heuristicParsed,
    warnings,
  };
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, lastSyncAt: new Date(), lastSyncSummary: JSON.stringify(result) },
    update: { lastSyncAt: new Date(), lastSyncSummary: JSON.stringify(result) },
  });
  return result;
}
