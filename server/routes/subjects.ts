import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { body, ownedSubject } from "../http";
import type { SubjectDTO } from "../../shared/types";
import { lessonInclude, reorderLessons, subjectStats, toLessonDTO } from "../services/lessons";

export const subjectsRouter = Router();

export async function listSubjects(userId: string): Promise<SubjectDTO[]> {
  const subjects = await prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return Promise.all(
    subjects.map(async (s) => ({ id: s.id, name: s.name, color: s.color, isVisible: s.isVisible, stats: await subjectStats(s.id) })),
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

subjectsRouter.patch("/:id", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const data = body(SubjectPatch, req);
  res.json(await prisma.subject.update({ where: { id: subject.id }, data }));
});

subjectsRouter.get("/:id/lessons", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const lessons = await prisma.lesson.findMany({ where: { subjectId: subject.id }, include: lessonInclude, orderBy: { sequenceOrder: "asc" } });
  const now = new Date();
  res.json(lessons.map((l) => toLessonDTO(l, now)));
});

subjectsRouter.post("/:id/reorder", async (req, res) => {
  const subject = await ownedSubject(req, req.params.id);
  const { orderedIds } = body(z.object({ orderedIds: z.array(z.string()) }), req);
  await reorderLessons(subject.id, orderedIds);
  const lessons = await prisma.lesson.findMany({ where: { subjectId: subject.id }, include: lessonInclude, orderBy: { sequenceOrder: "asc" } });
  res.json(lessons.map((l) => toLessonDTO(l)));
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
