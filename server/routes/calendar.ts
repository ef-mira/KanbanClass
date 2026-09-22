import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { body, HttpError } from "../http";
import type { CalendarEventDTO, EventType } from "../../shared/types";
import { fetchIcs, syncCalendar, syncWindow } from "../services/calendar/syncCalendar";
import { buildSampleIcs } from "../services/calendar/sampleTimetable";
import { assignSlots } from "../services/lessons";

export const calendarRouter = Router();

let syncing = false;
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (syncing) throw new HttpError(409, "A sync is already running");
  syncing = true;
  try {
    return await fn();
  } finally {
    syncing = false;
  }
}

/** Sync from the saved feed URL (e.g. https://api.zenbi.dk/exportcalendar/own/?key=...). */
calendarRouter.post("/sync", async (req, res) => {
  const settings = await prisma.userSettings.findUnique({ where: { userId: req.ctx.userId } });
  if (!settings?.icalUrl) throw new HttpError(400, "Add your calendar feed URL in Settings first");
  const result = await exclusive(async () => syncCalendar(req.ctx.userId, await fetchIcs(settings.icalUrl!)));
  res.json(result);
});

/** Import a pasted/uploaded .ics document. */
calendarRouter.post("/import", async (req, res) => {
  const { ics } = body(z.object({ ics: z.string().min(1) }), req);
  if (!ics.includes("BEGIN:VCALENDAR")) throw new HttpError(400, "That doesn't look like an iCal file");
  res.json(await exclusive(() => syncCalendar(req.ctx.userId, ics)));
});

/** Load a generated sample timetable for trying the app without a feed. */
calendarRouter.post("/demo", async (req, res) => {
  const settings = await prisma.userSettings.findUnique({ where: { userId: req.ctx.userId } });
  const { from, to } = syncWindow(settings);
  res.json(await exclusive(() => syncCalendar(req.ctx.userId, buildSampleIcs(from, to))));
});

calendarRouter.get("/events", async (req, res) => {
  const q = z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).parse(req.query);
  const events = await prisma.calendarEvent.findMany({
    where: { userId: req.ctx.userId, startTime: { gte: new Date(q.from), lt: new Date(q.to) } },
    include: { subject: { select: { color: true } } },
    orderBy: { startTime: "asc" },
  });
  const counts: Record<string, number> = {};
  const out: CalendarEventDTO[] = events.map((e) => {
    counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
    return {
      id: e.id,
      summary: e.summary,
      startTime: e.startTime.toISOString(),
      endTime: e.endTime.toISOString(),
      eventType: e.eventType as EventType,
      subjectName: e.subjectName,
      subjectId: e.subjectId,
      subjectColor: e.subject?.color ?? null,
      group: e.group,
      room: e.room,
      isPause: e.isPause,
      isIgnored: e.isIgnored,
      lessonId: e.lessonId,
    };
  });
  res.json({ events: out, counts });
});

/** Per-event override, e.g. skip a lesson slot that won't happen (excursion day). */
calendarRouter.patch("/events/:id", async (req, res) => {
  const { isIgnored } = body(z.object({ isIgnored: z.boolean() }), req);
  const ev = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.ctx.userId } });
  if (!ev) throw new HttpError(404, "Event not found");
  await prisma.calendarEvent.update({ where: { id: ev.id }, data: { isIgnored, ...(isIgnored && { lessonId: null }) } });
  if (ev.subjectId) await assignSlots(ev.subjectId);
  res.json({ ok: true });
});
