import type { CalendarEvent, Lesson, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { UNPLANNED_ALERT_DAYS, type LessonDTO, type LessonStatus, type LessonType, type SubjectStats } from "../../shared/types";
import { safeSegment, type StorageService } from "./storage/StorageService";

const DAY = 86_400_000;

/** Calendar events that count as teachable slots for a subject. */
export const slotWhere = (subjectId: string): Prisma.CalendarEventWhereInput => ({
  subjectId,
  eventType: "lesson",
  isIgnored: false,
});

/**
 * Binds lessons to calendar slots by position: the Nth lesson (by
 * sequenceOrder) occupies the Nth chronological slot. Reordering lessons
 * therefore moves their content to a different date while the timetable
 * itself stays fixed. Missing lessons are created as empty stubs.
 */
export async function assignSlots(subjectId: string): Promise<{ lessonsCreated: number }> {
  return prisma.$transaction(async (tx) => {
    const slots = await tx.calendarEvent.findMany({ where: slotWhere(subjectId), orderBy: { startTime: "asc" } });
    let lessons = await tx.lesson.findMany({ where: { subjectId }, orderBy: { sequenceOrder: "asc" } });

    // Drop trailing empty stubs that no longer have a slot (e.g. events removed from the feed).
    while (lessons.length > slots.length && isEmptyStub(lessons[lessons.length - 1])) {
      await tx.lesson.delete({ where: { id: lessons[lessons.length - 1].id } });
      lessons = lessons.slice(0, -1);
    }

    let lessonsCreated = 0;
    for (let i = lessons.length; i < slots.length; i++) {
      const created = await tx.lesson.create({
        data: { subjectId, sequenceOrder: i, title: "" },
      });
      lessons.push(created);
      lessonsCreated++;
    }

    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i].sequenceOrder !== i) {
        await tx.lesson.update({ where: { id: lessons[i].id }, data: { sequenceOrder: i } });
      }
    }

    await tx.calendarEvent.updateMany({ where: { subjectId, NOT: slotWhere(subjectId) }, data: { lessonId: null } });
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].lessonId !== lessons[i].id) {
        await tx.calendarEvent.update({ where: { id: slots[i].id }, data: { lessonId: lessons[i].id } });
      }
    }
    return { lessonsCreated };
  }, { timeout: 60_000 });
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
  await assignSlots(subjectId);
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
  };
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
