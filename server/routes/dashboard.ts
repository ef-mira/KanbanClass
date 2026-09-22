import { Router } from "express";
import { prisma } from "../db";
import { UNPLANNED_ALERT_DAYS, type DashboardDTO, type HomeworkQueueItem } from "../../shared/types";
import { lessonInclude, toLessonDTO } from "../services/lessons";
import { lessonLabel } from "../../shared/planning";
import { listSubjects } from "./subjects";
import { listTasks } from "./tasks";

export const dashboardRouter = Router();

const DAY = 86_400_000;
/** Show homework in the queue this many days before its release date, so it's visible ahead of time. */
const HOMEWORK_LOOKAHEAD_DAYS = 7;

dashboardRouter.get("/", async (req, res) => {
  const userId = req.ctx.userId;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const unplannedRows = await prisma.lesson.findMany({
    where: {
      subject: { userId },
      isPlanned: false,
      calendarEvents: { some: { startTime: { gte: now, lt: new Date(now.getTime() + UNPLANNED_ALERT_DAYS * DAY) } } },
    },
    include: { ...lessonInclude, subject: true },
  });
  const unplanned = unplannedRows
    .map((l) => ({ ...toLessonDTO(l, now), subjectName: l.subject.name, subjectColor: l.subject.color }))
    .sort((a, b) => (a.slot?.startTime ?? "").localeCompare(b.slot?.startTime ?? ""));

  const homeworkRows = await prisma.lesson.findMany({
    where: {
      subject: { userId },
      homeworkText: { not: null },
      homeworkOffset: { not: null },
      homeworkPostedAt: null,
      calendarEvents: { some: { startTime: { gte: startOfToday } } },
    },
    include: { subject: true, calendarEvents: { orderBy: { startTime: "asc" }, take: 1 } },
  });
  const homework: HomeworkQueueItem[] = [];
  for (const l of homeworkRows) {
    const slot = l.calendarEvents[0];
    if (!slot || !l.homeworkText?.trim()) continue;
    const lessonDay = new Date(slot.startTime.getFullYear(), slot.startTime.getMonth(), slot.startTime.getDate());
    const release = new Date(lessonDay.getTime() - l.homeworkOffset! * DAY);
    if (release.getTime() > startOfToday.getTime() + HOMEWORK_LOOKAHEAD_DAYS * DAY) continue;
    homework.push({
      lessonId: l.id,
      lessonTitle: lessonLabel(l),
      subjectName: l.subject.name,
      subjectColor: l.subject.color,
      homeworkText: l.homeworkText,
      releaseDate: release.toISOString(),
      lessonDate: slot.startTime.toISOString(),
      postedAt: null,
    });
  }
  homework.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

  const out: DashboardDTO = {
    subjects: await listSubjects(userId),
    unplanned,
    homework,
    tasks: await listTasks(userId, false),
  };
  res.json(out);
});
