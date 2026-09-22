import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contextMiddleware } from "./context";
import { errorHandler } from "./http";
import { calendarRouter } from "./routes/calendar";
import { categoriesRouter } from "./routes/categories";
import { dashboardRouter } from "./routes/dashboard";
import { lessonsRouter } from "./routes/lessons";
import { settingsRouter } from "./routes/settings";
import { subjectsRouter } from "./routes/subjects";
import { tasksRouter } from "./routes/tasks";
import { aiEnabled, AI_MODEL } from "./services/ai/client";

const PORT = Number(process.env.API_PORT ?? 3001);
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

// Production: serve the built client.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use(errorHandler);

app.listen(PORT, "127.0.0.1", () => {
  console.log(`KanbanClass API on http://localhost:${PORT}`);
  console.log(aiEnabled() ? `AI parsing: ${AI_MODEL}` : "AI parsing: off (no ANTHROPIC_API_KEY) — using heuristics");
});
