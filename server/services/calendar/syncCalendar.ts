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

  // Sources: one per distinct label. New lesson-like sources get their own
  // subject column by default; everything else defaults to "not needed".
  // The teacher adjusts this in the category modal.
  const labels = instances.map((inst, i) => sourceLabel(inst.summary, parse.results[i]));
  const { sourceByKey, subjectsCreated, newSources } = await upsertSources(userId, labels, parse.results.map((p) => p.eventType));

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
        const source = labels[i] ? sourceByKey.get(sourceKey(labels[i]!)) : undefined;
        const subjectId = source && !source.isIgnored ? source.subjectId : null;
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
          sourceId: source?.id ?? null,
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
    newSources,
    warnings,
  };
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, lastSyncAt: new Date(), lastSyncSummary: JSON.stringify(result) },
    update: { lastSyncAt: new Date(), lastSyncSummary: JSON.stringify(result) },
  });
  return result;
}

export const sourceKey = (label: string) => label.trim().replace(/\s+/g, " ").toLocaleLowerCase("da");

/** Label used to group entries: the parsed subject for lessons, else the summary up to the first " - ". Pauses get none. */
export function sourceLabel(summary: string, p: { eventType: string; subject: string | null }): string | null {
  if (p.eventType === "pause") return null;
  const label = (p.subject?.trim() || summary.split(/\s+[-–|]\s+/)[0]).trim().replace(/\s+/g, " ");
  return label || null;
}

async function upsertSources(userId: string, labels: (string | null)[], types: string[]) {
  const stats = new Map<string, { label: string; count: number; types: Map<string, number> }>();
  labels.forEach((label, i) => {
    if (!label) return;
    const key = sourceKey(label);
    const st = stats.get(key) ?? { label, count: 0, types: new Map() };
    st.count++;
    st.types.set(types[i], (st.types.get(types[i]) ?? 0) + 1);
    stats.set(key, st);
  });

  const subjects = await prisma.subject.findMany({ where: { userId } });
  const subjectByName = new Map(subjects.map((x) => [sourceKey(x.name), x]));
  let nextOrder = subjects.reduce((m, x) => Math.max(m, x.sortOrder + 1), 0);
  let subjectsCreated = 0;

  // Every teacher gets one renamable catch-all column for prep not tied to a subject.
  if (!subjects.some((x) => x.kind === "special")) {
    await prisma.subject.create({ data: { userId, name: uniqueName("Additional", subjectByName), kind: "special", color: "#64748b", sortOrder: 1000 } });
  }

  const existing = await prisma.eventSource.findMany({ where: { userId } });
  const byKey = new Map(existing.map((x) => [x.key, x]));
  let newSources = 0;
  for (const [key, st] of stats) {
    const eventType = [...st.types.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const found = byKey.get(key);
    if (found) {
      byKey.set(key, await prisma.eventSource.update({ where: { id: found.id }, data: { eventCount: st.count, eventType } }));
      continue;
    }
    let subjectId: string | null = null;
    if (eventType === "lesson") {
      let subject = subjectByName.get(key);
      if (!subject) {
        subject = await prisma.subject.create({
          data: { userId, name: st.label, color: SUBJECT_PALETTE[(nextOrder) % SUBJECT_PALETTE.length], sortOrder: nextOrder++ },
        });
        subjectByName.set(key, subject);
        subjectsCreated++;
      }
      subjectId = subject.id;
    }
    byKey.set(key, await prisma.eventSource.create({ data: { userId, key, label: st.label, eventType, eventCount: st.count, subjectId, isIgnored: !subjectId } }));
    newSources++;
  }
  // Sources that vanished from the feed keep their mapping (they may come back) but show no events.
  const gone = existing.filter((x) => !stats.has(x.key)).map((x) => x.id);
  if (gone.length) await prisma.eventSource.updateMany({ where: { id: { in: gone } }, data: { eventCount: 0 } });

  return { sourceByKey: byKey, subjectsCreated, newSources };
}

function uniqueName(base: string, taken: Map<string, unknown>): string {
  let name = base;
  for (let n = 2; taken.has(sourceKey(name)); n++) name = `${base} ${n}`;
  return name;
}
