import type { CalendarEvent, Lesson, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { UNPLANNED_ALERT_DAYS, type LessonDTO, type LessonStatus, type LessonType, type SubjectStats } from "../../shared/types";
import { safeSegment, type StorageService } from "./storage/StorageService";

const DAY = 86_400_000;

/** Calendar events that count as teachable slots for a subject. */
export const slotWhere = (subjectId: string): Prisma.CalendarEventWhereInput => ({
  subjectId,
  eventType: { not: "pause" }, // anything mapped to a column counts, e.g. "Fagdag Fysik" typed as "other"
  isIgnored: false,
});

/**
 * Binds lessons to calendar slots.
 *
 * - "stable" (sync, category changes): lessons keep the slot they already
 *   have; new slots get new empty lessons, so adding e.g. a "Fagdag" slot
 *   doesn't shift the rest of the plan.
 * - "positional" (drag reorder, skipping a slot): the Nth lesson by
 *   sequenceOrder takes the Nth chronological slot, so content moves along
 *   the fixed timetable.
 *
 * Lessons left without a slot are kept if they have content (shown as
 * unscheduled) and deleted if they are empty stubs. sequenceOrder always ends
 * up matching slot order.
 */
export async function assignSlots(subjectId: string, mode: "stable" | "positional" = "stable"): Promise<{ lessonsCreated: number }> {
  return prisma.$transaction(
    async (tx) => {
      const slots = await tx.calendarEvent.findMany({ where: slotWhere(subjectId), orderBy: { startTime: "asc" } });
      const lessons = await tx.lesson.findMany({ where: { subjectId }, orderBy: { sequenceOrder: "asc" } });
      const slotLesson: (Lesson | null)[] = new Array(slots.length).fill(null);
      const used = new Set<string>();

      if (mode === "positional") {
        lessons.slice(0, slots.length).forEach((l, i) => {
          slotLesson[i] = l;
          used.add(l.id);
        });
      } else {
        const byId = new Map(lessons.map((l) => [l.id, l]));
        slots.forEach((ev, i) => {
          const l = ev.lessonId ? byId.get(ev.lessonId) : undefined;
          if (l && !used.has(l.id)) {
            slotLesson[i] = l;
            used.add(l.id);
          }
        });
      }

      // Unused empty stubs are recycled for open slots before creating new ones.
      const leftovers = lessons.filter((l) => !used.has(l.id));
      const spareStubs = leftovers.filter(isEmptyStub);
      let lessonsCreated = 0;
      for (let i = 0; i < slots.length; i++) {
        if (slotLesson[i]) continue;
        const l = spareStubs.shift() ?? (lessonsCreated++, await tx.lesson.create({ data: { subjectId, sequenceOrder: 0, title: "" } }));
        slotLesson[i] = l;
        used.add(l.id);
      }

      const unscheduled = lessons.filter((l) => !used.has(l.id));
      for (const l of unscheduled.filter(isEmptyStub)) await tx.lesson.delete({ where: { id: l.id } });
      const kept = unscheduled.filter((l) => !isEmptyStub(l));

      const ordered = [...(slotLesson as Lesson[]), ...kept];
      for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].sequenceOrder !== i) await tx.lesson.update({ where: { id: ordered[i].id }, data: { sequenceOrder: i } });
      }

      await tx.calendarEvent.updateMany({ where: { lessonId: { in: lessons.map((l) => l.id) }, NOT: slotWhere(subjectId) }, data: { lessonId: null } });
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].lessonId !== slotLesson[i]!.id) await tx.calendarEvent.update({ where: { id: slots[i].id }, data: { lessonId: slotLesson[i]!.id } });
      }
      return { lessonsCreated };
    },
    { timeout: 60_000 },
  );
}

function isEmptyStub(l: Lesson): boolean {
  return !l.bodyText.trim() && !l.homeworkText && !l.folderPath && !l.title.trim();
}

export async function reorderLessons(subjectId: string, orderedIds: string[]) {
  const existing = await prisma.lesson.findMany({ where: { subjectId }, select: { id: true } });
  const known = new Set(existing.map((l) => l.id));
  if (orderedIds.length !== known.size || !orderedIds.every((id) => known.has(id))) {
    throw Object.assign(new Error("Reorder must include every lesson of the subject exactly once"), { status: 400 });
  }
  await prisma.$transaction(
    orderedIds.map((id, i) => prisma.lesson.update({ where: { id }, data: { sequenceOrder: i } })),
  );
  await assignSlots(subjectId, "positional");
}

type LessonWithRelations = Lesson & { calendarEvents: CalendarEvent[]; tasks: { isCompleted: boolean }[] };

export const lessonInclude = {
  calendarEvents: { orderBy: { startTime: "asc" } },
  tasks: { select: { isCompleted: true } },
} satisfies Prisma.LessonInclude;

export function lessonStatus(l: { bodyText: string; isPlanned: boolean }, slotStart: Date | null, slotEnd: Date | null, now = new Date()): LessonStatus {
  if (!slotStart || !slotEnd) return "no-slot";
  if (slotEnd < now) return "done";
  if (l.isPlanned) return "planned";
  return slotStart.getTime() - now.getTime() <= UNPLANNED_ALERT_DAYS * DAY ? "needs-plan" : "unplanned";
}

export function toLessonDTO(l: LessonWithRelations, now = new Date()): LessonDTO {
  const ev = l.calendarEvents[0] ?? null;
  return {
    id: l.id,
    subjectId: l.subjectId,
    sequenceOrder: l.sequenceOrder,
    title: l.title,
    lessonType: l.lessonType as LessonType,
    bodyText: l.bodyText,
    folderPath: l.folderPath,
    homeworkText: l.homeworkText,
    homeworkOffset: l.homeworkOffset,
    homeworkPostedAt: l.homeworkPostedAt?.toISOString() ?? null,
    isPlanned: l.isPlanned,
    slot: ev
      ? { eventId: ev.id, startTime: ev.startTime.toISOString(), endTime: ev.endTime.toISOString(), room: ev.room, group: ev.group }
      : null,
    status: lessonStatus(l, ev?.startTime ?? null, ev?.endTime ?? null, now),
    openTaskCount: l.tasks.filter((t) => !t.isCompleted).length,
    files: { names: [], total: 0 },
  };
}

const PREVIEW_FILES = 3;

/** Fills card file previews; only lessons with a folder touch the disk. */
export async function withFiles(dtos: LessonDTO[], storage: StorageService): Promise<LessonDTO[]> {
  await Promise.all(
    dtos.map(async (d) => {
      if (!d.folderPath) return;
      const files = await storage.list(d.folderPath).catch(() => []);
      d.files = { names: files.slice(0, PREVIEW_FILES).map((f) => f.name), total: files.length };
    }),
  );
  return dtos;
}

export async function subjectStats(subjectId: string, now = new Date()): Promise<SubjectStats> {
  const [totalSlots, remainingSlots, completed, planned] = await Promise.all([
    prisma.calendarEvent.count({ where: slotWhere(subjectId) }),
    prisma.calendarEvent.count({ where: { ...slotWhere(subjectId), startTime: { gte: now } } }),
    prisma.calendarEvent.count({ where: { ...slotWhere(subjectId), endTime: { lt: now }, lessonId: { not: null } } }),
    prisma.lesson.count({ where: { subjectId, isPlanned: true } }),
  ]);
  return { totalSlots, remainingSlots, completed, planned };
}

/** School year label used in folder paths: Aug 2026 – Jul 2027 -> "2026". */
export function schoolYearLabel(date: Date, schoolYearStart: Date | null): string {
  if (schoolYearStart) return String(schoolYearStart.getFullYear());
  return String(date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1);
}

/** Creates /<root>/<year>/<Subject>/Lesson_<n>/ and stores the path on the lesson. */
export async function ensureLessonFolder(userId: string, lessonId: string, storage: StorageService): Promise<string> {
  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id: lessonId },
    include: { subject: true, calendarEvents: { orderBy: { startTime: "asc" }, take: 1 } },
  });
  if (lesson.folderPath && (await storage.exists(lesson.folderPath))) return lesson.folderPath;
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const when = lesson.calendarEvents[0]?.startTime ?? new Date();
  const key = [schoolYearLabel(when, settings?.schoolYearStart ?? null), safeSegment(lesson.subject.name), `Lesson_${lesson.sequenceOrder + 1}`].join("/");
  const folderPath = await storage.ensureFolder(key);
  await prisma.lesson.update({ where: { id: lessonId }, data: { folderPath } });
  return folderPath;
}
