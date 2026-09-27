import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Layers, Plus, Trash2 } from "lucide-react";
import type { DashboardDTO, EventType, HomeworkQueueItem } from "../../shared/types";
import { EVENT_TYPES } from "../../shared/types";
import { useDashboard, useEvents, useLessonAction, useSettings, useTaskMutations, useUpdateSettings } from "../api";
import { useNav } from "../nav";
import { addDays, isoDate, isoWeek, startOfWeek } from "../lib/format";
import { Button } from "../ui/Button";
import { MetricCard } from "../ui/MetricCard";
import { ToggleChip } from "../ui/ToggleChip";
import { TaskRow } from "../ui/TaskRow";
import { WeekGrid } from "../ui/WeekGrid";
import type { CalendarEvent, Task } from "../ui/types";
import { cx, localIso, relativeDays, shortDate, shortDateTime, time } from "../ui/format";
import { Skeleton } from "../components/ui";
import { useToast } from "../components/toast";

const TYPE_LABEL: Record<EventType, string> = { lesson: "Lessons", pause: "Pauses", meeting: "Meetings", supervision: "Supervision", other: "Other" };

export function Dashboard() {
  const { data, isLoading } = useDashboard();
  const { data: settings } = useSettings();
  const { go, openCategories } = useNav();

  if (!isLoading && data && data.subjects.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <div className="max-w-sm text-center">
          <h2 className="text-[15px] font-semibold">Connect your timetable to get started</h2>
          <p className="mt-1 text-[13px] text-text-muted">Add your Zenbi iCal feed, import an .ics file, or load a sample timetable.</p>
          <div className="mt-4">
            <Button variant="primary" onClick={() => go("settings")}>
              Open calendar settings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-4 pb-5">
      {!!settings?.pendingSources && (
        <button
          onClick={openCategories}
          className="flex h-[38px] shrink-0 items-center gap-2.5 rounded-[9px] bg-accent-soft px-3.5 text-[13px] text-text transition-colors hover:brightness-[.97]"
        >
          <Layers size={15} className="text-accent" />
          <span>
            <b className="font-semibold">
              {settings.pendingSources} new kind{settings.pendingSources > 1 ? "s" : ""} of calendar entries
            </b>{" "}
            to sort into your columns
          </span>
          <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-accent">
            Review <ChevronRight size={14} />
          </span>
        </button>
      )}

      <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-3">
        {isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px]" />)}
        {data?.subjects.map((s) => (
          <button key={s.id} onClick={() => go("board", { subjectId: s.id })} className="text-left">
            <MetricCard name={s.name} color={s.color} completed={s.stats.completed} planned={s.stats.planned} remaining={s.stats.remainingSlots} totalSlots={s.stats.totalSlots} />
          </button>
        ))}
      </div>

      <div className="grid min-h-[520px] flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <WeekPanel />
        <div className="flex flex-col gap-4">{data && <ActionPanels data={data} />}</div>
      </div>
    </div>
  );
}

function WeekPanel() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const { data } = useEvents(weekStart, addDays(weekStart, 7));
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { openLesson, openDay } = useNav();
  const hidden = new Set<EventType>(settings?.hiddenEventTypes ?? ["pause"]);

  const events: CalendarEvent[] = useMemo(
    () =>
      (data?.events ?? [])
        .filter((e) => !hidden.has(e.eventType))
        .map((e) => ({
          id: e.id,
          title: e.subjectName ?? e.summary,
          start: localIso(e.startTime),
          end: localIso(e.endTime),
          room: e.room,
          kind: e.eventType,
          ignored: e.isIgnored,
          subjectColor: e.subjectColor,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, settings?.hiddenEventTypes],
  );

  const toggleType = (t: EventType) => {
    const next = new Set(hidden);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    updateSettings.mutate({ hiddenEventTypes: [...next] });
  };

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-panel border border-border bg-surface-raised">
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <h2 className="text-[14px] font-semibold">Week {isoWeek(weekStart)}</h2>
        <span className="text-[12px] text-text-muted tabular-nums">
          {shortDate(weekStart)}–{shortDate(addDays(weekStart, 4))}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronRight size={15} className="rotate-180" />} />
          <Button size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </Button>
          <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronRight size={15} />} />
        </div>
      </header>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {EVENT_TYPES.map((t) => (
          <ToggleChip key={t} label={TYPE_LABEL[t]} active={!hidden.has(t)} onToggle={() => toggleType(t)} count={data?.counts[t] ?? 0} />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <WeekGrid
          weekStart={isoDate(weekStart)}
          events={events}
          now={localIso(new Date())}
          onEventClick={(id) => {
            const ev = data?.events.find((e) => e.id === id);
            if (ev?.lessonId) openLesson(ev.lessonId);
            else if (ev) openDay(isoDate(new Date(ev.startTime)));
          }}
        />
      </div>
    </section>
  );
}

function Panel({ title, meta, count, tone, children, defaultOpen = true }: { title: string; meta?: string; count: number; tone?: "warning"; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col overflow-hidden rounded-panel border border-border bg-surface-raised">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-10 shrink-0 items-center gap-2 px-3.5 text-left">
        <ChevronDown size={14} className={cx("text-text-faint transition-transform", !open && "-rotate-90")} />
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {meta && <span className="text-[12px] text-text-muted">· {meta}</span>}
        <span
          className={cx(
            "ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
            tone === "warning" && count > 0 ? "bg-warning-soft text-warning" : "bg-surface-hover text-text-muted",
          )}
        >
          {count}
        </span>
      </button>
      {open && <div className="flex min-h-0 flex-col overflow-y-auto">{children}</div>}
    </section>
  );
}

const ROW = "flex items-center gap-2.5 border-t border-border px-3.5 py-2";

function ActionPanels({ data }: { data: DashboardDTO }) {
  const { openLesson } = useNav();
  const { create, update, remove } = useTaskMutations();
  const toast = useToast();
  const [newTask, setNewTask] = useState("");
  const visibleUnplanned = data.unplanned.slice(0, 3);
  const openTasks = data.tasks.filter((t) => !t.isCompleted).length;

  const tasks: Task[] = data.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    done: t.isCompleted,
    due: t.dueDate ? shortDateTime(t.dueDate).split(" · ")[0] : null,
    autoExtracted: t.isAutoGenerated,
    lessonId: t.lessonId ?? "",
    lessonTitle: t.lessonTitle ?? "",
  }));

  return (
    <>
      <Panel title="Unplanned" meta="next 14 days" count={data.unplanned.length} tone="warning">
        {data.unplanned.length === 0 && <p className="border-t border-border px-3.5 py-3 text-[12px] text-text-muted">Everything in the next two weeks has notes.</p>}
        {visibleUnplanned.map((l) => (
          <div key={l.id} className={ROW}>
            <span className="size-2 shrink-0 rounded-full" style={{ background: l.subjectColor }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{l.title || l.subjectName}</div>
              <div className="truncate text-[11px] text-text-muted tabular-nums">
                {l.slot && `${shortDateTime(l.slot.startTime)} · ${relativeDays(l.slot.startTime)}`}
              </div>
            </div>
            <Button size="sm" onClick={() => openLesson(l.id)}>
              Plan
            </Button>
          </div>
        ))}
        {data.unplanned.length > visibleUnplanned.length && (
          <div className="border-t border-border px-3.5 py-2 text-[12px] text-text-muted">{data.unplanned.length - visibleUnplanned.length} more</div>
        )}
      </Panel>

      <Panel title="Homework to post" count={data.homework.filter((h) => new Date(h.releaseDate) <= new Date()).length}>
        {data.homework.length === 0 && <p className="border-t border-border px-3.5 py-3 text-[12px] text-text-muted">No homework reminders due this week.</p>}
        {data.homework.map((h) => (
          <HomeworkRow key={h.lessonId} item={h} />
        ))}
      </Panel>

      <Panel title="Tasks" count={openTasks}>
        <form
          className="flex items-center gap-2 border-t border-border px-3.5 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTask.trim()) return;
            create.mutate(
              { title: newTask.trim(), dueDate: isoDate(new Date()) },
              { onSuccess: () => setNewTask(""), onError: (err) => toast({ kind: "error", text: err.message }) },
            );
          }}
        >
          <Plus size={14} className="text-text-faint" />
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="Add a task…"
            aria-label="New task"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-text-faint"
          />
        </form>
        {tasks.map((t) => (
          <div key={t.id} className="group flex items-center border-t border-border pr-2">
            <div className="min-w-0 flex-1">
              <TaskRow task={t} onToggle={() => update.mutate({ id: t.id, isCompleted: !t.done })} onOpenLesson={(id) => id && openLesson(id)} />
            </div>
            <button
              onClick={() => remove.mutate(t.id)}
              aria-label={`Delete ${t.title}`}
              className="shrink-0 rounded p-1 text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </Panel>
    </>
  );
}

function HomeworkRow({ item: h }: { item: HomeworkQueueItem }) {
  const { openLesson } = useNav();
  const post = useLessonAction(h.lessonId);
  const toast = useToast();
  const due = new Date(h.releaseDate) <= new Date();
  return (
    <div className={ROW}>
      <button className="min-w-0 flex-1 text-left" onClick={() => openLesson(h.lessonId)}>
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: h.subjectColor }} />
          <span className="truncate text-[13px] font-medium">{h.lessonTitle}</span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-text-muted">{h.homeworkText}</div>
        <div className={cx("mt-0.5 truncate text-[11px] font-medium tabular-nums", due ? "text-warning" : "text-text-muted")}>
          {due ? "Due since" : "Releases"} {shortDate(h.releaseDate)} · lesson {shortDate(h.lessonDate)} {time(h.lessonDate)}
        </div>
      </button>
      <Button
        variant="soft"
        size="sm"
        disabled={post.isPending}
        onClick={() => post.mutate({ kind: "post" }, { onSuccess: () => toast({ kind: "success", text: "Marked as posted" }), onError: (e) => toast({ kind: "error", text: e.message }) })}
      >
        Mark posted
      </Button>
    </div>
  );
}
