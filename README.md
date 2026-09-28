# KanbanClass

A desktop (Electron) annual lesson planner for teachers, inspired by ClickUp. It turns a fixed school timetable (an iCal feed, e.g. from Zenbi) into a Kanban board of lesson cards per subject. You plan, reorder, attach files to, and set homework on those cards, and a dashboard shows what needs attention.

## Features (V1)

- **Calendar sync.** Import from a Zenbi / iCal / webcal URL, an `.ics` file, or a built-in sample timetable. Each entry is classified as lesson, pause, meeting, supervision or other, and subject, group and room are extracted. This uses Claude Haiku 4.5 when an Anthropic API key is added in Settings, and Danish/English keyword heuristics otherwise. Identical entries are parsed once and cached. Dates and times always come straight from the iCal data, never from the model.
- **Categories.** The first time an import brings in new kinds of entries, a Kanban-style modal opens. Drag each entry ("Fysik 10", "Fagdag Fysik", "Galla") into a board column, merge several into one, or drop it in *Not needed*. It stays on the calendar but never becomes lessons. Every teacher gets one renamable *special* column for prep that isn't tied to a subject. Planned lessons keep their dates when entries are merged.
- **Board.** Two views: **By subject** (one column per subject, draggable to reorder) and **By week** (one column per day, cards in time order with a subject tag). A week is 5 days (Mon–Fri) or 7 (Mon–Sun, e.g. for efterskoler), set in **Settings → Week**; the dashboard calendar follows the same setting. Clicking anywhere on a card opens it. Cards show the top of the plan, plus homework and files when set, and expand in place when something is cut off. Dragging a card (mouse or keyboard) changes which slot a lesson occupies: the timetable stays fixed and the lesson content moves. Undo is available.
- **Lesson editor.** One page with Plan, Homework and Files. The plan is a live Markdown editor in the style of Obsidian (CodeMirror 6): formatting renders as you type, markers stay faint, and `- [ ]` is a real checkbox. Files upload by button or drag-and-drop, creating the lesson folder on first upload. Templates exist in the API (`shared/templates.ts`) but are hidden in the UI.
- **Dashboard.** Per-subject counters (completed / planned / remaining slots), a weekly calendar grid with event-type filter chips, a day slide-over, and an action queue: lessons in the next 14 days with no notes, homework due to post, and tasks.
- **Action-item extraction.** Saving notes pulls out teacher to-dos ("Order copper sulfate", unchecked `- [ ]` items) and adds them as auto-generated tasks.

## Installing

Run `release\KanbanClass Setup 1.0.0.exe` (build it with `npm run dist`). It installs for your Windows user only, so no admin prompt, and adds a desktop and Start-menu shortcut. The installer isn't code-signed, so Windows SmartScreen may warn on first run: choose *More info → Run anyway*.

Your data lives in `%APPDATA%\KanbanClass\` (`kanbanclass.db`, window size, and the encrypted API key). **Settings → Your data** shows the exact database file, and *Open data folder* opens it. Lesson files stay in `~/Documents/Teaching/…`, or wherever you point **Settings → Lesson folders → Browse…**.

### Desktop-only features

- **Folder picker** for the lesson-folder root.
- **Anthropic API key in Settings.** It's encrypted with Electron `safeStorage` (Windows DPAPI) and takes effect without a restart. `ANTHROPIC_API_KEY` in the environment overrides it.
- **Click a file** in a lesson to open it in its default app.
- Links to other sites open in your normal browser.

## Development

Requires Node 20+.

```bash
npm install
npm run dev
```

`npm run dev` starts Vite (hot reload) and Electron together. Changes to `electron/` or `server/` rebuild and restart the app window. In development the app reads an optional `.env` (see `.env.example`).

| Script | What it does |
|---|---|
| `npm run dev` | Vite on :5173, the API inside Electron on :3001, auto-restart on server changes |
| `npm start` | Build, then run the production build in Electron (no installer) |
| `npm run dist` | Build the Windows installer into `release/` |
| `npm run dist:dir` | Build an unpacked app in `release/win-unpacked/` (faster, for testing) |
| `npm run typecheck` | TypeScript across Electron, server, client and shared code |
| `npm run db:migration -- <name>` | After editing `prisma/schema.prisma`, write the SQL migration the app applies on next launch |

### Database changes

The installed app has no Prisma CLI. On startup `server/migrate.ts` applies any new `prisma/migrations/<name>/migration.sql` to the user's database and records it in `_kanbanclass_migrations`. To change the schema, edit `schema.prisma`, run `npm run db:migration -- describe_change`, and commit the new folder. Never edit a migration that has shipped.

## Architecture

```
electron/
  main.ts          App window, menu, IPC (folder picker, API key), starts the API in-process
  preload.ts       `window.kanbanclass` bridge (contract in shared/desktop.ts)
scripts/           esbuild bundling (electron-build.mjs), dev runner, migration helper
server/            Express 5 API, Prisma + SQLite, runs inside the Electron main process
  migrate.ts       Applies prisma/migrations on startup
  context.ts       Per-request { userId, storage, lms }. Every query is scoped to userId
  routes/          settings, calendar, categories, subjects, lessons, tasks, dashboard
  services/
    calendar/      iCal fetch + recurrence expansion, sync (EventSource mapping), sample timetable
    ai/            Anthropic client, event parser, action-item extractor, heuristic fallbacks
    lessons.ts     Slot binding (stable on sync, positional on reorder), status, stats, folders
    storage/       StorageService interface + LocalDiskStorage
    lms/           LMSAdapter interface + manual adapter
shared/            Types, templates and planning rules used by both sides
src/
  ui/              Design-system components (presentational)
  views/           Screens that wire those components to the API
  components/      App-specific pieces (sidebar, toasts, Markdown editor)
                   React 19 + Tailwind v4 + TanStack Query + dnd-kit
prisma/schema.prisma, prisma/migrations/
build/icon.svg     App icon source; icon.png is rendered from it (electron-builder makes the .ico)
```

The window loads the client from the in-process API at `http://127.0.0.1:41731` (a fixed port keeps the origin, and so the theme saved in localStorage, stable; if it's taken a free port is used). Main, preload and server are bundled by esbuild into `dist-electron/*.cjs`. npm dependencies ship unbundled in `node_modules`, because Prisma loads its query engine from there, which is also why `asar` is off.

### V2 seams

- **`LMSAdapter`** (`server/services/lms`): `postHomework()` is manual in V1. Lectio or Google Classroom adapters plug in behind the same interface.
- **`StorageService`** (`server/services/storage`): folder create, list and reveal. S3 or Google Drive implementations replace `LocalDiskStorage`.
- **Multi-tenant.** Every root model carries `userId`, and routes only read `req.ctx.userId`. V1 resolves it to `LOCAL_USER_ID`; V2 resolves it from auth.

### Design system

`src/index.css` holds the design tokens (light and dark, mapped into Tailwind v4 via `@theme inline`), and `src/ui/` holds its components, adapted to the app's DTOs. Colours, spacing and type live in those two places, so restyling means touching them rather than the views.

### Safety

The API binds to `127.0.0.1` and rejects cross-origin requests, so other websites can't drive it. The window runs sandboxed with context isolation, and IPC only answers the app's own origin. Folder operations are confined to the configured teaching root, and file and folder launches never go through a shell.

## Roadmap: accounts (later)

Planned for when KanbanClass moves beyond one local user:

- **Sign-in:** email + password or magic-link login, sessions, password reset. `contextMiddleware` resolves `userId` from the session instead of `LOCAL_USER_ID`.
- **Email notifications:** homework due to post, unplanned lessons in the next 14 days, and new calendar entries to sort. Sent by a scheduled job.
- **Hosted data:** Postgres instead of SQLite, S3 or Google Drive behind `StorageService`, and Lectio / Google Classroom behind `LMSAdapter`.
- **Admin system:** manage schools, teachers and invites, see sync health, and handle support.

The groundwork is already in place: every root model carries `userId`, and routes only read `req.ctx.userId`.
