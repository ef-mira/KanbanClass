import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { body, HttpError } from "../http";
import type { CategoriesDTO, EventType, SubjectKind } from "../../shared/types";
import { assignSlots } from "../services/lessons";

/**
 * The category modal: map each calendar source ("Fysik 10", "Fagdag Fysik",
 * "Galla") to a board column, or to "not needed". Columns are subjects or
 * special catch-all categories and can be created, renamed and reordered here.
 */
export const categoriesRouter = Router();

export async function loadCategories(userId: string): Promise<CategoriesDTO> {
  const now = new Date();
  const [subjects, sources] = await Promise.all([
    prisma.subject.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { lessons: true } }, lessons: { where: { isPlanned: true }, select: { id: true } } },
    }),
    prisma.eventSource.findMany({
      where: { userId, eventCount: { gt: 0 } },
      orderBy: [{ label: "asc" }],
      include: { events: { where: { startTime: { gte: now } }, orderBy: { startTime: "asc" }, take: 1, select: { startTime: true } } },
    }),
  ]);
  return {
    columns: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      kind: s.kind as SubjectKind,
      lessonCount: s._count.lessons,
      plannedCount: s.lessons.length,
    })),
    sources: sources.map((s) => ({
      id: s.id,
      label: s.label,
      eventType: s.eventType as EventType,
      eventCount: s.eventCount,
      subjectId: s.isIgnored ? null : s.subjectId,
      isIgnored: s.isIgnored || !s.subjectId,
      reviewed: s.reviewed,
      nextDate: s.events[0]?.startTime.toISOString() ?? null,
    })),
  };
}

categoriesRouter.get("/", async (req, res) => {
  res.json(await loadCategories(req.ctx.userId));
});

const Save = z.object({
  columns: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        kind: z.enum(["subject", "special"]),
      }),
    )
    .max(60),
  assignments: z.array(z.object({ sourceId: z.string(), columnId: z.string().nullable() })),
});

categoriesRouter.put("/", async (req, res) => {
  const userId = req.ctx.userId;
  const p = body(Save, req);

  const names = p.columns.map((c) => c.name.toLocaleLowerCase("da"));
  const dupe = names.find((n, i) => names.indexOf(n) !== i);
  if (dupe) throw new HttpError(400, `Two columns are called “${p.columns[names.indexOf(dupe)].name}”`);

  const subjects = await prisma.subject.findMany({ where: { userId } });
  const owned = new Set(subjects.map((s) => s.id));
  const sources = await prisma.eventSource.findMany({ where: { userId }, select: { id: true } });
  const ownedSources = new Set(sources.map((s) => s.id));
  const colIds = new Set(p.columns.map((c) => c.id));
  for (const a of p.assignments) {
    if (!ownedSources.has(a.sourceId)) throw new HttpError(400, "Unknown calendar source");
    if (a.columnId && !colIds.has(a.columnId)) throw new HttpError(400, "Assignment points at a column that isn't in the list");
  }

  const warnings: string[] = [];
  await prisma.$transaction(
    async (tx) => {
      // Two-phase rename so swapping two names doesn't trip the unique index.
      for (const s of subjects) await tx.subject.update({ where: { id: s.id }, data: { name: `__renaming__${s.id}` } });

      const idMap = new Map<string, string>(); // client column id -> subject id
      for (const [i, c] of p.columns.entries()) {
        if (owned.has(c.id)) {
          await tx.subject.update({ where: { id: c.id }, data: { name: c.name, color: c.color, kind: c.kind, sortOrder: i } });
          idMap.set(c.id, c.id);
        } else {
          const created = await tx.subject.create({ data: { userId, name: c.name, color: c.color, kind: c.kind, sortOrder: i } });
          idMap.set(c.id, created.id);
        }
      }
      // Subjects dropped from the list keep their stored name back until we decide below whether to delete them.
      for (const s of subjects) if (!colIds.has(s.id)) await tx.subject.update({ where: { id: s.id }, data: { name: s.name } });

      for (const a of p.assignments) {
        const subjectId = a.columnId ? idMap.get(a.columnId)! : null;
        await tx.eventSource.update({ where: { id: a.sourceId }, data: { subjectId, isIgnored: !subjectId, reviewed: true } });
        // Lessons already planned on these dates follow their slots into the new column.
        if (subjectId) {
          const linked = await tx.calendarEvent.findMany({ where: { sourceId: a.sourceId, lessonId: { not: null } }, select: { lessonId: true } });
          await tx.lesson.updateMany({ where: { id: { in: linked.map((e) => e.lessonId!) }, subjectId: { not: subjectId } }, data: { subjectId } });
        }
        await tx.calendarEvent.updateMany({ where: { sourceId: a.sourceId }, data: { subjectId, ...(subjectId ? {} : { lessonId: null }) } });
      }
      // Anything the teacher has now seen counts as reviewed.
      await tx.eventSource.updateMany({ where: { userId }, data: { reviewed: true } });
    },
    { timeout: 120_000 },
  );

  // Re-bind lessons to slots everywhere, then drop columns that ended up with nothing in them.
  const all = await prisma.subject.findMany({ where: { userId } });
  for (const s of all) await assignSlots(s.id);
  for (const s of all) {
    const listed = colIds.has(s.id) || !owned.has(s.id);
    const [sourceCount, lessonCount] = await Promise.all([
      prisma.eventSource.count({ where: { subjectId: s.id } }),
      prisma.lesson.count({ where: { subjectId: s.id } }),
    ]);
    // Removed columns and empty subject columns go; special columns stay even when empty (manual prep).
    const removable = !listed || (s.kind === "subject" && sourceCount === 0);
    if (!removable) continue;
    if (lessonCount === 0) await prisma.subject.delete({ where: { id: s.id } });
    else if (!listed) warnings.push(`“${s.name}” was kept because it has ${lessonCount} planned lesson(s).`);
  }

  res.json({ ...(await loadCategories(userId)), warnings });
});
