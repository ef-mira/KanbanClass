import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { body, HttpError, ownedSubject } from "../http";
import type { SubjectDTO, SubjectKind } from "../../shared/types";
import { lessonInclude, reorderLessons, subjectStats, toLessonDTO, withFiles } from "../services/lessons";

export const subjectsRouter = Router();

export async function listSubjects(userId: string): Promise<SubjectDTO[]> {
  const subjects = await prisma.subject.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return Promise.all(
    subjects.map(async (s) => ({ id: s.id, name: s.name, color: s.color, isVisible: s.isVisible, kind: s.kind as SubjectKind, sortOrder: s.sortOrder, stats: await subjectStats(s.id) })),
  );
}

subjectsRouter.get("/", async (req, res) => {
  res.json(await listSubjects(req.ctx.userId));
});

const SubjectPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isVisible: z.boolean().optional(),
});

/** Board column order (also used by the sidebar). */
subjectsRouter.post("/order", async (req, res) => {
  const { orderedIds } = body(z.object({ orderedIds: z.array(z.string()).max(200) }), req);
  const owned = await prisma.subject.findMany({ where: { userId: req.ctx.userId }, select: { id: true } });
  const known = new Set(owned.map((s) => s.id));
  if (!orderedIds.every((id) => known.has(id))) throw new HttpError(400, "Unknown subject");
  await prisma.$transaction(orderedIds.map((id, i) => prisma.subject.update({ where: { id }, data: { sortOrder: i } })));
  res.json(await listSubjects(req.ctx.userId));
});

subjectsRouter.patch("/:id", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const data = body(SubjectPatch, req);
  res.json(await prisma.subject.update({ where: { id: subject.id }, data }));
});

subjectsRouter.get("/:id/lessons", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const lessons = await prisma.lesson.findMany({ where: { subjectId: subject.id }, include: lessonInclude, orderBy: { sequenceOrder: "asc" } });
  const now = new Date();
  res.json(await withFiles(lessons.map((l) => toLessonDTO(l, now)), req.ctx.storage));
});

subjectsRouter.post("/:id/reorder", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const { orderedIds } = body(z.object({ orderedIds: z.array(z.string()) }), req);
  await reorderLessons(subject.id, orderedIds);
  const lessons = await prisma.lesson.findMany({ where: { subjectId: subject.id }, include: lessonInclude, orderBy: { sequenceOrder: "asc" } });
  res.json(await withFiles(lessons.map((l) => toLessonDTO(l)), req.ctx.storage));
});

subjectsRouter.post("/:id/lessons", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const { title } = body(z.object({ title: z.string().trim().min(1).max(200).optional() }), req);
  const count = await prisma.lesson.count({ where: { subjectId: subject.id } });
  const lesson = await prisma.lesson.create({
    data: { subjectId: subject.id, sequenceOrder: count, title: title ?? "New lesson" }, // untitled lessons count as disposable sync stubs
    include: lessonInclude,
  });
  res.status(201).json(toLessonDTO(lesson));
});
