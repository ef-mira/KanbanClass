import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { prisma } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function body<T>(schema: ZodType<T>, req: Request): T {
  return schema.parse(req.body ?? {});
}

/** Loads a lesson only if it belongs to the requesting user. */
export async function ownedLesson(req: Request, id: string) {
  const lesson = await prisma.lesson.findFirst({ where: { id, subject: { userId: req.ctx.userId } }, include: { subject: true } });
  if (!lesson) throw new HttpError(404, "Lesson not found");
  return lesson;
}

export async function ownedSubject(req: Request, id: string) {
  const subject = await prisma.subject.findFirst({ where: { id, userId: req.ctx.userId } });
  if (!subject) throw new HttpError(404, "Subject not found");
  return subject;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", issues: err.issues });
    return;
  }
  const status = (err as { status?: number }).status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err instanceof Error ? err.message : "Unexpected error" });
}
