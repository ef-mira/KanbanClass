# KanbanClass

A local-first annual lesson planner for teachers, inspired by ClickUp. It turns a fixed school timetable (an iCal feed, e.g. from Zenbi) into a Kanban board of lesson cards per subject. You plan, reorder, attach files to, and set homework on those cards, and a dashboard shows what needs attention.

## Features (V1)

- **Calendar sync.** Import from a Zenbi / iCal / webcal URL, an `.ics` file, or a built-in sample timetable. Each entry is classified as lesson, pause, meeting, supervision or other, and subject, group and room are extracted. This uses Claude Haiku 4.5 when `ANTHROPIC_API_KEY` is set, and Danish/English keyword heuristics otherwise. Identical entries are parsed once and cached. Dates and times always come straight from the iCal data, never from the model.
- **Categories.** The first time an import brings in new kinds of entries, a Kanban-style modal opens. Drag each entry ("Fysik 10", "Fagdag Fysik", "Galla") into a board column, merge several into one, or drop it in *Not needed*. It stays on the calendar but never becomes lessons. Every teacher gets one renamable *special* column for prep that isn't tied to a subject. Planned lessons keep their dates when entries are merged.
- **Subject Kanban.** One column per subject, with visibility toggles. Cards have a fixed height and show the top of the plan, the homework and the files. You can expand one card or all of them to see everything. Drag a card (mouse or keyboard) to change which slot a lesson occupies: the timetable stays fixed and the lesson content moves. Undo is available.
- **Lesson drawer.** A Markdown editor with preview and autosave, a homework release trigger ("remind me N days before"), and a local folder with an "Open in File Explorer / Finder" button. Lesson templates exist in the API (`shared/templates.ts`) but are hidden in the V1 UI.
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
  routes/          settings, calendar, categories, subjects, lessons, tasks, dashboard
  services/
    calendar/      iCal fetch + recurrence expansion, sync (EventSource mapping), sample timetable
    ai/            Anthropic client, event parser, action-item extractor, heuristic fallbacks
    lessons.ts     Slot binding (stable on sync, positional on reorder), status, stats, folders
    storage/       StorageService interface + LocalDiskStorage
    lms/           LMSAdapter interface + manual adapter
shared/            Types, templates and planning rules used by both sides
src/               React 19 + Tailwind v4 + TanStack Query + dnd-kit
prisma/schema.prisma
UI_DESIGN_PROMPT.md  Paste-ready brief for Claude Design (visual redesign)
```

### V2 seams

- **`LMSAdapter`** (`server/services/lms`): `postHomework()` is manual in V1. Lectio or Google Classroom adapters plug in behind the same interface.
- **`StorageService`** (`server/services/storage`): folder create, list and reveal. S3 or Google Drive implementations replace `LocalDiskStorage`.
- **Multi-tenant.** Every root model carries `userId`, and routes only read `req.ctx.userId`. V1 resolves it to `LOCAL_USER_ID`; V2 resolves it from auth.

### Safety

The API binds to `127.0.0.1` and rejects cross-origin requests, so other websites can't drive it. Folder operations are confined to the configured teaching root, and file-manager launches never go through a shell.

## Roadmap: accounts (later)

Planned for when KanbanClass moves beyond one local user:

- **Sign-in:** email + password or magic-link login, sessions, password reset. `contextMiddleware` resolves `userId` from the session instead of `LOCAL_USER_ID`.
- **Email notifications:** homework due to post, unplanned lessons in the next 14 days, and new calendar entries to sort. Sent by a scheduled job.
- **Hosted data:** Postgres instead of SQLite, S3 or Google Drive behind `StorageService`, and Lectio / Google Classroom behind `LMSAdapter`.
- **Admin system:** manage schools, teachers and invites, see sync health, and handle support.

The groundwork is already in place: every root model carries `userId`, and routes only read `req.ctx.userId`.
