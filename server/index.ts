import express from "express";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { contextMiddleware } from "./context";
import { errorHandler } from "./http";
import { migrate } from "./migrate";
import { calendarRouter } from "./routes/calendar";
import { categoriesRouter } from "./routes/categories";
import { dashboardRouter } from "./routes/dashboard";
import { lessonsRouter } from "./routes/lessons";
import { settingsRouter } from "./routes/settings";
import { subjectsRouter } from "./routes/subjects";
import { tasksRouter } from "./routes/tasks";
import { aiEnabled, AI_MODEL } from "./services/ai/client";

export interface ServerOptions {
  /** Preferred port. If it is taken, a free one is picked instead (unless `strictPort`). */
  port: number;
  strictPort?: boolean;
  /** Built client to serve. Omitted in dev, where Vite serves it. */
  distDir?: string;
  /** Folder of `<name>/migration.sql` files applied on startup. */
  migrationsDir: string;
}

function createApp(distDir?: string) {
  const app = express();

  // Local-only app: bind to loopback and reject cross-site requests so a web
  // page in the user's browser can't drive the API (e.g. open folders).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.status(403).json({ error: "Cross-origin requests are not allowed" });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", contextMiddleware);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/settings", settingsRouter);
  app.use("/api/calendar", calendarRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/subjects", subjectsRouter);
  app.use("/api/lessons", lessonsRouter);
  app.use("/api/tasks", tasksRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}

/** Applies pending migrations, then serves the API on 127.0.0.1. Resolves to the port in use. */
export async function startServer(opts: ServerOptions): Promise<number> {
  await migrate(opts.migrationsDir);
  const app = createApp(opts.distDir);

  const listen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = app.listen(port, "127.0.0.1");
      server.once("listening", () => resolve((server.address() as AddressInfo).port));
      server.once("error", reject);
    });

  let port: number;
  try {
    port = await listen(opts.port);
  } catch (err) {
    if (opts.strictPort || (err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
    port = await listen(0);
  }
  console.log(`KanbanClass API on http://127.0.0.1:${port}`);
  console.log(aiEnabled() ? `AI parsing: ${AI_MODEL}` : "AI parsing: off (no API key) — using heuristics");
  return port;
}
