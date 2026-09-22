import { useState, type ReactNode } from "react";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronRight, Link2, ListTodo, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import type { SubjectDTO, TaskDTO } from "../../shared/types";
import { useDashboard, useLessonAction, useTaskMutations } from "../api";
import { useNav } from "../nav";
import { fmtDay, fmtTime, isoDate, relativeDays } from "../lib/format";
import { lessonLabel } from "../../shared/planning";
import { Button, cx, Empty, IconButton, ProgressBar, Skeleton, SubjectTag } from "../components/ui";
import { useToast } from "../components/toast";
import { WeekGrid } from "./WeekGrid";

export function Dashboard() {
  const { data, isLoading } = useDashboard();
  const { go } = useNav();

  if (!isLoading && data && data.subjects.length === 0) {
    return (
      <div className="grid h-full place-items-center">
        <Empty icon={<CalendarDays className="size-7" />} title="Connect your timetable to get started">
          Add your Zenbi iCal feed, import an .ics file, or load a sample timetable.
          <div className="mt-3">
            <Button variant="primary" onClick={() => go("settings")}>
              Open calendar settings
            </Button>
          </div>
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="flex flex-wrap gap-3">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-[118px] w-[260px]" />)}
        {data?.subjects.map((s) => <MetricCard key={s.id} subject={s} onClick={() => go("board", { subjectId: s.id })} />)}
      </div>

      <div className="mt-5 grid grid-cols-12 gap-5">
        <div className="col-span-12 xl:col-span-8">
          <WeekGrid />
        </div>
        <div className="col-span-12 flex flex-col gap-3 xl:col-span-4">
          {data && (
            <>
              <UnplannedSection items={data.unplanned} />
              <HomeworkSection items={data.homework} />
              <TaskSection tasks={data.tasks} />
            </>
          )}
          {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ subject: s, onClick }: { subject: SubjectDTO; onClick: () => void }) {
  const st = s.stats;
  const upcomingPlanned = Math.max(0, Math.min(st.planned, st.remainingSlots));
  return (
    <button
      onClick={onClick}
      className="w-[260px] rounded-[10px] border border-line bg-raised p-3 text-left transition-colors hover:border-line-strong"
      style={{ boxShadow: `inset 3px 0 0 ${s.color}` }}
    >
      <div className="truncate pl-1 text-[13px] font-semibold">{s.name}</div>
      <div className="mt-2 grid grid-cols-3 gap-1 pl-1">
        <Metric value={st.completed} label="Completed" />
        <Metric value={st.planned} label="Planned" />
        <Metric value={st.remainingSlots} label="Remaining" />
      </div>
      <div className="mt-2.5 pl-1">
        <ProgressBar
          total={st.totalSlots}
          segments={[
            { value: st.completed, color: "var(--success)", label: `${st.completed} completed` },
            { value: upcomingPlanned, color: s.color, label: `${upcomingPlanned} upcoming planned` },
          ]}
          label={`${st.totalSlots} slots this school year`}
        />
      </div>
    </button>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-[28px] leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] text-faint">{label}</div>
    </div>
  );
}

function Section({ title, count, tone, icon, children, defaultOpen = true, action }: { title: string; count: number; tone?: "warning"; icon: ReactNode; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-[10px] border border-line bg-surface">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="size-3.5 text-faint" /> : <ChevronRight className="size-3.5 text-faint" />}
          <span className={cx(tone === "warning" && count > 0 ? "text-warning" : "text-muted")}>{icon}</span>
          <h2 className="text-[13px] font-semibold">{title}</h2>
          <span className={cx("rounded-full px-1.5 text-[11px] tabular-nums", tone === "warning" && count > 0 ? "bg-warning/15 text-warning" : "bg-hover text-muted")}>{count}</span>
        </button>
        {action}
      </header>
      {open && <div className="border-t border-line">{children}</div>}
    </section>
  );
}

function UnplannedSection({ items }: { items: import("../../shared/types").DashboardDTO["unplanned"] }) {
  const { openLesson } = useNav();
  return (
    <Section title="Unplanned · next 14 days" count={items.length} tone="warning" icon={<AlertTriangle className="size-4" />}>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-faint">Everything in the next two weeks has notes. Nice.</div>
      ) : (
        <ul className="max-h-[260px] divide-y divide-line overflow-y-auto">
          {items.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <SubjectTag name={l.subjectName} color={l.subjectColor} />
                  <span className="truncate text-[13px]">{lessonLabel(l)}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-faint">
                  {l.slot && `${fmtDay(l.slot.startTime)} ${fmtTime(l.slot.startTime)} · ${relativeDays(l.slot.startTime)}`}
                </div>
              </div>
              <Button size="sm" onClick={() => openLesson(l.id)}>
                Plan
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function HomeworkSection({ items }: { items: import("../../shared/types").HomeworkQueueItem[] }) {
  const today = isoDate(new Date());
  const due = items.filter((h) => isoDate(new Date(h.releaseDate)) <= today).length;
  return (
    <Section title="Homework to post" count={due} icon={<Send className="size-4" />}>
      {items.length === 0 ? (
        <div className="px-3 py-4 text-xs text-faint">No homework reminders due this week. Set them in a lesson's Homework tab.</div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((h) => (
            <HomeworkRow key={h.lessonId} item={h} isDue={isoDate(new Date(h.releaseDate)) <= today} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function HomeworkRow({ item: h, isDue }: { item: import("../../shared/types").HomeworkQueueItem; isDue: boolean }) {
  const { openLesson } = useNav();
  const post = useLessonAction(h.lessonId);
  const toast = useToast();
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <button className="min-w-0 flex-1 text-left" onClick={() => openLesson(h.lessonId)}>
        <div className="flex items-center gap-1.5">
          <SubjectTag name={h.subjectName} color={h.subjectColor} />
          <span className="truncate text-[13px]">{h.lessonTitle}</span>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-faint">{h.homeworkText}</div>
        <div className={cx("mt-0.5 text-[11px]", isDue ? "font-medium text-warning" : "text-faint")}>
          {isDue ? "Post now" : "Releases"} · {fmtDay(h.releaseDate)} · lesson {fmtDay(h.lessonDate)}
        </div>
      </button>
      <Button
        size="sm"
        variant={isDue ? "primary" : "secondary"}
        loading={post.isPending}
        onClick={() => post.mutate({ kind: "post" }, { onSuccess: () => toast({ kind: "success", text: "Marked as posted" }) })}
      >
        Mark posted
      </Button>
    </li>
  );
}

function TaskSection({ tasks }: { tasks: TaskDTO[] }) {
  const { create, update, remove } = useTaskMutations();
  const { openLesson } = useNav();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(isoDate(new Date()));
  const today = isoDate(new Date());
  const open = tasks.filter((t) => !t.isCompleted).length;

  const add = () => {
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), dueDate: due }, { onSuccess: () => setTitle(""), onError: (e) => toast({ kind: "error", text: e.message }) });
  };

  return (
    <Section title="Tasks" count={open} icon={<ListTodo className="size-4" />}>
      <form
        className="flex items-center gap-1.5 border-b border-line px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Plus className="size-3.5 text-faint" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="New task" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="rounded border border-line bg-raised px-1 font-mono text-[11px] text-muted" />
      </form>
      {tasks.length === 0 ? (
        <div className="px-3 py-4 text-xs text-faint">No open tasks. Action items like “Order copper sulfate” are pulled from your lesson notes automatically.</div>
      ) : (
        <ul className="max-h-[360px] divide-y divide-line overflow-y-auto">
          {tasks.map((t) => {
            const overdue = !t.isCompleted && isoDate(new Date(t.dueDate)) < today;
            return (
              <li key={t.id} className="group flex items-start gap-2 px-3 py-2">
                <input
                  type="checkbox"
                  checked={t.isCompleted}
                  onChange={(e) => update.mutate({ id: t.id, isCompleted: e.target.checked })}
                  aria-label={`Complete ${t.title}`}
                  className="mt-0.5 size-3.5 accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <div className={cx("text-[13px]", t.isCompleted && "text-faint line-through")}>
                    {t.isAutoGenerated && <Sparkles className="mr-1 inline size-3 text-accent" aria-label="Extracted from lesson notes" />}
                    {t.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                    <span className={cx("font-mono", overdue ? "font-medium text-danger" : "text-faint")}>{overdue ? `Overdue · ${fmtDay(t.dueDate)}` : fmtDay(t.dueDate)}</span>
                    {t.lessonId && t.subjectName && (
                      <button onClick={() => openLesson(t.lessonId!)} className="inline-flex min-w-0 items-center gap-1 text-faint hover:text-fg">
                        <Link2 className="size-3" />
                        <span className="truncate">
                          {t.subjectName} · {t.lessonTitle}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                <IconButton label="Delete task" className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => remove.mutate(t.id)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
