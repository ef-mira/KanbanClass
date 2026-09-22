# KanbanClass

A local-first annual lesson planner for teachers, inspired by ClickUp. It turns a fixed school timetable (an iCal feed, e.g. from Zenbi) into a Kanban board of lesson cards per subject. You plan, reorder, attach files to, and set homework on those cards, and a dashboard shows what needs attention.

## Features (V1)

- **Calendar sync.** Import from a Zenbi / iCal / webcal URL, an `.ics` file, or a built-in sample timetable. Each entry is classified as lesson, pause, meeting, supervision or other, and subject, group and room are extracted. This uses Claude Haiku 4.5 when `ANTHROPIC_API_KEY` is set, and Danish/English keyword heuristics otherwise. Identical entries are parsed once and cached. Dates and times always come straight from the iCal data, never from the model.
- **Subject Kanban.** One column per subject, with visibility toggles. Cards are in chronological order. Drag a card (mouse or keyboard) to change which slot a lesson occupies: the timetable stays fixed and the lesson content moves. Undo is available.
- **Lesson drawer.** A Markdown editor with preview and autosave. Templates (standard, lab, test, excursion, project) insert boilerplate, and all but the standard template create the lesson folder. There's a homework release trigger ("remind me N days before") and a local folder with an "Open in File Explorer / Finder" button.
- **Dashboard.** Per-subject counters (completed / planned / remaining slots), a weekly calendar grid with event-type filter chips, a day slide-over, and an action queue: lessons in the next 14 days with no notes, homework due to post, and tasks.
- **Action-item extraction.** Saving notes pulls out teacher to-dos ("Order copper sulfate", unchecked `- [ ]` items) and adds them as auto-generated tasks.

## Getting started

Requires Node 20+.

```bash
npm install
npx prisma db push
cp .env.example .env   # optional: add ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:5173, go to **Calendar & settings**, then paste your feed URL or click **Load sample timetable**.

| Script | What it does |
|---|---|
| `npm run dev` | API (port 3001, `tsx watch`) and Vite client (port 5173) together |
| `npm run build` then `npm start` | Build the client; the API serves it on port 3001 |
| `npm run typecheck` | TypeScript across server, client and shared code |
| `npm run db:studio` | Browse the SQLite database |

Lesson folders default to `~/Documents/Teaching/<year>/<Subject>/Lesson_<n>/`. You can change the root in Settings.

## Architecture

```
server/            Express 5 API (tsx), Prisma + SQLite
  context.ts       Per-request { userId, storage, lms }. Every query is scoped to userId
  routes/          settings, calendar, subjects, lessons, tasks, dashboard
  services/
    calendar/      iCal fetch + recurrence expansion, sync, sample timetable
    ai/            Anthropic client, event parser, action-item extractor, heuristic fallbacks
    lessons.ts     Slot binding (Nth lesson <-> Nth slot), status, stats, folders
    storage/       StorageService interface + LocalDiskStorage
    lms/           LMSAdapter interface + manual adapter
shared/            Types, templates and planning rules used by both sides
src/               React 19 + Tailwind v4 + TanStack Query + dnd-kit
prisma/schema.prisma
UI_DESIGN_PROMPT.md  Design-system prompt for a design assistant (v0 / Figma / Claude)
```

### V2 seams

- **`LMSAdapter`** (`server/services/lms`): `postHomework()` is manual in V1. Lectio or Google Classroom adapters plug in behind the same interface.
- **`StorageService`** (`server/services/storage`): folder create, list and reveal. S3 or Google Drive implementations replace `LocalDiskStorage`.
- **Multi-tenant.** Every root model carries `userId`, and routes only read `req.ctx.userId`. V1 resolves it to `LOCAL_USER_ID`; V2 resolves it from auth.

### Safety

The API binds to `127.0.0.1` and rejects cross-origin requests, so other websites can't drive it. Folder operations are confined to the configured teaching root, and file-manager launches never go through a shell.
