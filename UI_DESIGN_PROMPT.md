# KanbanClass: brief for Claude Design

> **How to use:** open Claude Design (claude.ai/design) and start a new design. Paste everything below the line. Attach 2–4 screenshots of the running app (Subjects board, a lesson drawer, the dashboard, the Categories modal) and say "this is the current version; redesign it". Hand the result back to Claude Code to wire into `src/`.

---

## What you're designing

KanbanClass is a desktop web app a Danish secondary-school teacher uses to plan a full school year. Their fixed timetable comes in from the school system as an iCal feed. Every timetable slot becomes a **lesson card** in a Kanban column per subject ("Fysik 10", "Matematik 10A", "10. klasse dansk"). The teacher writes the plan on each card, sets homework, and keeps files in a folder per lesson.

The current build works and has the right structure, but it looks unpolished. **Redesign it to feel like ClickUp: clean, calm, dense but airy, obviously a professional tool.** Keep every feature described below. You are changing the look, spacing and hierarchy, not the product.

## Look and feel

- **Reference: ClickUp's board view.** White canvas, light-grey column backgrounds, white cards with a hairline border and a whisper of shadow, and status pills with soft tinted backgrounds. Column headers are a small coloured pill (uppercase subject name) with a count next to it. Hierarchy comes from generous inner padding and a few type sizes, not from boxes inside boxes.
- **Avoid:** heavy borders, nested outlined panels, too many font sizes, all-caps everywhere, and coloured left-edge stripes on every card.
- **Light theme first,** with a matching dark theme (cool near-black, surfaces lifted by lightness, not shadows).
- **Type:** Inter, 13px base, 14px semibold card titles, 11px meta. Use tabular numerals for dates, times and counts.
- **Colour:** one accent (ClickUp-style violet, around `#6b5cf0`). Each subject has a user-picked hex colour, used only for its column pill, a small dot and progress bars. Status colours: done green, needs-plan amber, planned accent.
- **Corners:** 8px on cards, 12px on columns and modals, full-round on pills.
- Must work at 1440×900 and 1280×800. Danish text (æøå, longer words) must fit.

## Screens

### 1. Subjects board (most important)

- **Two view modes** in a segmented control at the top left:
  - **By subject** (default): one 320px column per subject, horizontally scrolling. Columns can be **dragged to reorder** by a grip that appears on hover in the column header. The last column is usually a renamable **special** column (e.g. "Additional") for prep that isn't tied to one subject, like "Fagdag". It gets a subtle "Special" tag.
  - **By day**: one column per weekday (Monday–Friday, plus Saturday or Sunday only when something is scheduled), with ‹ Today › week navigation and "Week 39". Cards sit in time order and carry a **subject tag**. The time range (`10:00–11:30`) replaces the date.
- **Column header (By subject):** colored subject pill, visible card count, hide button. Under it, a thin progress bar (completed / planned / remaining) with three small numbers.
- Completed lessons are tucked into a "Show 22 completed lessons" row at the top of each subject column.
- **Toolbar:**
  - View switch.
  - Status filter pills: Needs plan, Unplanned, Planned, Unscheduled.
  - "Next 14 days".
  - On the right: **Collapse all / Expand all**, and **Categories** with a "3 new" badge.

#### The lesson card

The teacher should see at a glance what's planned. **Clicking anywhere on the card opens the editor.** The drag handle and "Show more" are the only other controls.

| Part | Rule |
|---|---|
| Header | Drag handle (on hover, By subject only). In By day, the subject tag. Short date and time (`Wed 23/9 · 08:00`), or the time range in By day. Room. Status pill on the right |
| Title | Only if the teacher wrote one. **Never show a placeholder like "Lesson 12"**; untitled cards simply have no title row |
| **Plan** | Always shown. Up to 3 lines of the notes as plain text (headings shown only when they're all there is, bullets as •, checkboxes as ☐), or italic grey "No plan yet" |
| **Homework** | **Only when homework has been set.** One line plus "Post Sun 20/9" on the right |
| **Files** | **Only when the lesson folder has files.** One line of names (`worksheet.pdf, slides.pptx +2`) plus a count |
| Footer | Only when needed: open-task count, and **"Show more ⌄" only if something is actually cut off** (notes longer than 3 lines, homework or file names truncated, more files than shown). Never show a toggle that does nothing |

- Expanded: full rendered Markdown, full homework, full file list.
- Show the variety: a rich card, one with only a plan, an empty upcoming card, and a completed (faded) card.
- Status pills: **Done** (green, check), **Planned** (accent outline), **Needs plan** (amber, alert icon; the one that should catch the eye), **Unplanned** (faint dashed), **Unscheduled** (grey).
- No lesson-type icons and no template UI anywhere.
- Drag state: lifted card, slight tilt, drop indicator line.

### 2. Lesson editor (opens from a card)

A 640px slide-over from the right, laid out as **one scrolling page with no tabs**, like a Notion page:

- **Header:**
  - Subject pill and status.
  - "Saved 10:42" indicator, previous/next lesson chevrons, close.
  - A large editable title (placeholder "Add a title").
  - Date · time · room · group.
- **Plan:** a section label with a small formatting toolbar on the right (heading, bold, italic, list, checklist, link). Below it, a **live Markdown editor in the style of Obsidian**: the teacher types Markdown and it's formatted as they type. `## Heading` becomes a large bold line with the `##` still visible but faded, `**bold**` turns bold with faded asterisks, and `- [ ]` becomes a real clickable checkbox. There's no separate preview pane. Under the editor, an "Action items found" strip of chips (auto-extracted to-dos like "Order copper sulfate").
- **Homework:** if none is set, one quiet dashed "+ Add homework" row. Once added:
  - A text box, with a footer row reading "Remind me [1d] [3d] [7d] [14d] [n] before the lesson · Release Mon 21/9".
  - A status line ("Releases in 3 days", "Due to post", "Posted 22 Sept").
  - Buttons: "Mark posted", and "Post to LMS" (disabled, "coming later" tooltip).
  - A small remove (trash) button.
- **Files:** section label with "Upload" and "Open in File Explorer" actions.
  - The file list (icon, name, size, date).
  - A **drop zone**: "Drop files here or click to upload", highlighted while dragging files over it. Uploading creates the lesson folder if needed.
  - The folder path in small mono text with a copy button.

### 3. Categories modal (new: needs the most design help)

This opens automatically the first time a calendar import brings in new kinds of entries. It can also be reopened from the board toolbar or Settings. It is itself a small Kanban:

- **Wide centred modal** (~1280px). Header: icon, "Organize calendar categories", one line of explanation, a "11 new" badge, and a close button.
- **Pinned on the left: "Not needed."** Entries dropped here stay on the calendar but never become lesson cards (e.g. "Galla", "Extra tid", "Gårdvagt", "Lærermøde"). Dashed outline, neutral grey.
- **Then one column per board column:**
  - Colour dot (click to change) and an inline-editable name.
  - A Subject / Special toggle tag, a "155 slots" count, and a remove button.
- **Entry chips** inside columns: drag handle, name ("Fagdag Fysik"), a "New" badge if unseen, and a meta line ("Event · 2 times · 14 Oct"). There's also a small move-to menu icon for keyboard users.
- Merging is the key idea. Dropping "Fagdag Fysik" into the "Fysik 10" column makes those days part of Fysik's lesson sequence. Show a column holding two merged entries.
- After the columns: dashed "+ Subject column" and "+ Special column" buttons, with a line of help text.
- **Footer:** "11 calendar entries · 5 columns · 4 not needed", then Cancel and "Save categories" (primary).
- Show the drop-target highlight while dragging.

### 4. Dashboard (lighter touch)

- **Top row:** one metric card per subject (Completed / Planned / Remaining, a big number each, and a stacked progress bar).
- **Left, about 2/3 width:** a Monday–Friday week grid, 08:00–16:00, with events as blocks tinted by subject colour. Pauses and ignored events are hatched and faint. Above the grid: event-type filter pills with counts (Lessons, Pauses, Meetings, Supervision, Other).
- **Right, about 1/3:** stacked collapsible panels:
  - "Unplanned · next 14 days" (amber count, a "Plan" button per row)
  - "Homework to post" ("Mark posted" per row)
  - "Tasks" (checkbox, title, due date, sparkle icon on auto-extracted ones, link to the lesson)
- When new calendar entries need sorting, a slim accent banner across the top: "3 new kinds of calendar entries to sort into your columns · Review".

### 5. App shell

- **Left sidebar (232px, collapsible to 56px):** "KC" logo mark + "KanbanClass". Navigation: Dashboard / Subjects board / Calendar & settings. A "Subjects" list with colour dot, name, `22/155` count and an eye toggle on hover. At the bottom: sync status, a sync button and a theme toggle.
- **Top bar (48px):** page title and today's date.

## Deliverables

1. **Design tokens** as CSS custom properties, light and dark, plus the Tailwind v4 `@theme inline` block that maps them. Keep these names so the app can swap them in directly: `--bg --surface --surface-raised --surface-hover --border --border-strong --text --text-muted --text-faint --accent --accent-soft --accent-fg --success --warning --danger --info --focus-ring --scrim --shadow-float`.
2. **Mockups:** Subjects board By subject (collapsed and expanded, light and dark) and By day, lesson editor (empty lesson, and a full one with homework and files, mid file-drag), Categories modal (including mid-drag), and Dashboard.
3. **React 19 + Tailwind v4 components** in TypeScript, presentational only (props in, callbacks out), `lucide-react` icons, no other UI kit: `LessonCard`, `KanbanColumn`, `DayColumn`, `BoardToolbar`, `StatusBadge`, `SubjectPill`, `ProgressBar`, `CategoryColumn`, `SourceChip`, `LessonEditor` page shell (Plan / Homework / Files sections, file drop zone), `MetricCard`, `WeekGrid`, `TaskRow`, `Button`, `ToggleChip`.

Use these data shapes (they match the app), with realistic Danish sample data: 4 subjects plus one special column, a mix of every status, some cards with long notes, homework and 4+ files, and some empty.

```ts
type LessonStatus = "done" | "planned" | "needs-plan" | "unplanned" | "no-slot";
interface Lesson {
  id: string; sequenceOrder: number; title: string; bodyText: string; // Markdown
  homeworkText: string | null; homeworkOffset: number | null; homeworkPostedAt: string | null;
  slot: { startTime: string; endTime: string; room: string | null; group: string | null } | null;
  status: LessonStatus; openTaskCount: number;
  files: { names: string[]; total: number }; // first 3 names + total
}
interface Subject { id: string; name: string; color: string; kind: "subject" | "special"; stats: { completed: number; planned: number; remainingSlots: number; totalSlots: number } }
interface CalendarSource { id: string; label: string; eventType: "lesson" | "meeting" | "supervision" | "other"; eventCount: number; reviewed: boolean; nextDate: string | null }
```
