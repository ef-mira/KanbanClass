import { Router } from "express";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db";
import { body } from "../http";
import { EVENT_TYPES, type EventType, type SettingsDTO } from "../../shared/types";
import { AI_MODEL, aiEnabled } from "../services/ai/client";
import { defaultTeachingRoot } from "../services/storage/LocalDiskStorage";

export const settingsRouter = Router();

export async function loadSettings(userId: string): Promise<SettingsDTO> {
  const s = await prisma.userSettings.findUnique({ where: { userId } });
  return {
    icalUrl: s?.icalUrl ?? null,
    teachingRoot: s?.teachingRoot || defaultTeachingRoot(),
    schoolYearStart: s?.schoolYearStart?.toISOString() ?? null,
    schoolYearEnd: s?.schoolYearEnd?.toISOString() ?? null,
    hiddenEventTypes: s ? (JSON.parse(s.hiddenEventTypes) as EventType[]) : ["pause"],
    lastSyncAt: s?.lastSyncAt?.toISOString() ?? null,
    lastSyncSummary: s?.lastSyncSummary ?? null,
    aiEnabled: aiEnabled(),
    aiModel: AI_MODEL,
    pendingSources: await prisma.eventSource.count({ where: { userId, reviewed: false, eventCount: { gt: 0 } } }),
    platform: process.platform,
  };
}

settingsRouter.get("/", async (req, res) => {
  res.json(await loadSettings(req.ctx.userId));
});

const SettingsPatch = z.object({
  icalUrl: z.string().trim().url().or(z.literal("")).nullable().optional(),
  teachingRoot: z.string().trim().nullable().optional(),
  schoolYearStart: z.iso.date().nullable().optional(),
  schoolYearEnd: z.iso.date().nullable().optional(),
  hiddenEventTypes: z.array(z.enum(EVENT_TYPES)).optional(),
});

settingsRouter.put("/", async (req, res) => {
  const p = body(SettingsPatch, req);
  const data = {
    ...(p.icalUrl !== undefined && { icalUrl: p.icalUrl || null }),
    ...(p.teachingRoot !== undefined && { teachingRoot: p.teachingRoot ? path.resolve(p.teachingRoot) : null }),
    ...(p.schoolYearStart !== undefined && { schoolYearStart: p.schoolYearStart ? new Date(`${p.schoolYearStart}T00:00:00`) : null }),
    ...(p.schoolYearEnd !== undefined && { schoolYearEnd: p.schoolYearEnd ? new Date(`${p.schoolYearEnd}T23:59:59`) : null }),
    ...(p.hiddenEventTypes && { hiddenEventTypes: JSON.stringify(p.hiddenEventTypes) }),
  };
  await prisma.userSettings.upsert({ where: { userId: req.ctx.userId }, create: { userId: req.ctx.userId, ...data }, update: data });
  res.json(await loadSettings(req.ctx.userId));
});
