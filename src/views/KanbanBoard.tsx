import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  EyeOff,
  FileText,
  GripVertical,
  Layers,
  ListTodo,
  MapPin,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { LessonDTO, LessonStatus, SubjectDTO } from "../../shared/types";
import { keys, useLessonFiles, useLessonRange, useLessons, useReorder, useReorderSubjects, useSettings, useSubjects, useUpdateSubject, type DayLesson } from "../api";
import { useNav } from "../nav";
import { addDays, fmtDay, fmtShortDay, fmtTime, isoDate, isoWeek, mdPreview, startOfWeek, subjectTint } from "../lib/format";
import { lessonLabel } from "../../shared/planning";
import { useIsDark } from "../lib/theme";
import { Button, cx, Empty, IconButton, ProgressBar, Skeleton, StatusBadge, SubjectTag, ToggleChip } from "../components/ui";
import { useToast } from "../components/toast";

const STATUS_FILTERS: { status: LessonStatus; label: string }[] = [
  { status: "needs-plan", label: "Needs plan" },
  { status: "unplanned", label: "Unplanned" },
  { status: "planned", label: "Planned" },
  { status: "no-slot", label: "Unscheduled" },
];

type Mode = "subjects" | "days";

/** Expand state: a board-wide default plus per-card exceptions. */
interface ExpandState {
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
}
const ExpandContext = createContext<ExpandState>({ isExpanded: () => false, toggle: () => {} });

/** Set when any drag ends, so the click that follows a drop doesn't open the lesson. */
let lastDragEnd = 0;

function readMode(): Mode {
  try {
    return localStorage.getItem("boardMode") === "days" ? "days" : "subjects";
  } catch {
    return "subjects";
  }
}

export function KanbanBoard() {
  const { data: settings } = useSettings();
  const { openCategories } = useNav();
  const [mode, setModeState] = useState<Mode>(readMode);
  const [statusFilter, setStatusFilter] = useState<Set<LessonStatus>>(new Set());
  const [next14, setNext14] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem("boardMode", m);
    } catch {
      /* per-session only */
    }
  };

  const expand = useMemo<ExpandState>(
    () => ({
      isExpanded: (id) => allExpanded !== exceptions.has(id),
      toggle: (id) =>
        setExceptions((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        }),
    }),
    [allExpanded, exceptions],
  );
  const setAll = (v: boolean) => {
    setAllExpanded(v);
    setExceptions(new Set());
  };
  const toggleStatus = (s: LessonStatus) =>
    setStatusFilter((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });
  const filter = useMemo(
    () => (l: LessonDTO) => {
      if (statusFilter.size && !statusFilter.has(l.status)) return false;
      if (next14 && (!l.slot || new Date(l.slot.startTime).getTime() > Date.now() + 14 * 86_400_000)) return false;
      return true;
    },
    [statusFilter, next14],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        <div className="flex rounded-md border border-line bg-raised p-0.5" role="group" aria-label="Board view">
          <SegButton active={mode === "subjects"} onClick={() => setMode("subjects")} icon={<Columns3 className="size-3.5" />}>
            By subject
          </SegButton>
          <SegButton active={mode === "days"} onClick={() => setMode("days")} icon={<CalendarDays className="size-3.5" />}>
            By day
          </SegButton>
        </div>
        {mode === "days" && (
          <div className="flex items-center gap-1">
            <IconButton label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              <ChevronLeft className="size-4" />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              Today
            </Button>
            <IconButton label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              <ChevronRight className="size-4" />
            </IconButton>
            <span className="ml-1 text-xs font-medium text-muted">Week {isoWeek(weekStart)}</span>
          </div>
        )}
        <span className="mx-1 h-4 w-px bg-line" />
        {STATUS_FILTERS.map((f) => (
          <ToggleChip key={f.status} pressed={statusFilter.has(f.status)} onClick={() => toggleStatus(f.status)}>
            {f.label}
          </ToggleChip>
        ))}
        {mode === "subjects" && (
          <ToggleChip pressed={next14} onClick={() => setNext14((v) => !v)}>
            Next 14 days
          </ToggleChip>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-line bg-raised p-0.5" role="group" aria-label="Card size">
            <SegButton active={!allExpanded && exceptions.size === 0} onClick={() => setAll(false)} icon={<ChevronsDownUp className="size-3.5" />}>
              Collapse all
            </SegButton>
            <SegButton active={allExpanded && exceptions.size === 0} onClick={() => setAll(true)} icon={<ChevronsUpDown className="size-3.5" />}>
              Expand all
            </SegButton>
          </div>
          <button onClick={openCategories} className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 text-xs font-medium text-muted hover:border-line-strong hover:text-fg">
            <Layers className="size-3.5" /> Categories
            {!!settings?.pendingSources && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">{settings.pendingSources} new</span>}
          </button>
        </div>
      </div>

      <ExpandContext.Provider value={expand}>
        {mode === "subjects" ? <SubjectBoard filter={filter} filtering={statusFilter.size > 0 || next14} /> : <DayBoard weekStart={weekStart} filter={filter} />}
      </ExpandContext.Provider>
    </div>
  );
}

function SegButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={cx("flex h-6 items-center gap-1 rounded px-2 text-xs", active ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg")}>
      {icon}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- By subject */

function SubjectBoard({ filter, filtering }: { filter: (l: LessonDTO) => boolean; filtering: boolean }) {
  const { data: subjects, isLoading } = useSubjects();
  const { focusSubjectId } = useNav();
  const reorderSubjects = useReorderSubjects();
  const qc = useQueryClient();
  const board = useRef<HTMLDivElement>(null);
  const [activeCol, setActiveCol] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const visible = subjects?.filter((s) => s.isVisible) ?? [];
  const hiddenCount = (subjects?.length ?? 0) - visible.length;

  useEffect(() => {
    if (focusSubjectId) board.current?.querySelector(`[data-subject="${focusSubjectId}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [focusSubjectId, subjects]);

  const onDragEnd = (e: DragEndEvent) => {
    setActiveCol(null);
    lastDragEnd = Date.now();
    if (!subjects || !e.over || e.active.id === e.over.id) return;
    const ids = subjects.map((s) => s.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    qc.setQueryData<SubjectDTO[]>(keys.subjects, next.map((id) => subjects.find((s) => s.id === id)!));
    reorderSubjects.mutate(next);
  };

  if (isLoading)
    return (
      <div className="flex gap-4 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex w-[320px] shrink-0 flex-col gap-2">
            <Skeleton className="h-14" />
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="h-40" />
            ))}
          </div>
        ))}
      </div>
    );

  if (visible.length === 0)
    return (
      <Empty icon={<ListTodo className="size-6" />} title={subjects?.length ? "All subject columns are hidden" : "No subjects yet"}>
        {subjects?.length ? "Use the eye toggles in the sidebar to show columns." : "Sync your calendar in Calendar & settings. Subjects are created from your timetable."}
      </Empty>
    );

  const active = subjects?.find((s) => s.id === activeCol);
  return (
    <div ref={board} className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveCol(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveCol(null)}>
        <SortableContext items={visible.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          {visible.map((s) => (
            <SortableColumn key={s.id} subject={s} filter={filter} filtering={filtering} />
          ))}
        </SortableContext>
        <DragOverlay>
          {active ? (
            <div className="h-24 w-[320px] rotate-1 rounded-xl border border-line-strong bg-surface p-3 shadow-float">
              <ColumnTitle subject={active} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {hiddenCount > 0 && (
        <div className="flex w-10 shrink-0 items-start justify-center pt-4 text-faint" title={`${hiddenCount} hidden column(s). Show them from the sidebar.`}>
          <EyeOff className="size-4" />
        </div>
      )}
    </div>
  );
}

function ColumnTitle({ subject }: { subject: SubjectDTO }) {
  const tint = subjectTint(subject.color, useIsDark());
  return (
    <span className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold tracking-wide uppercase" style={{ background: tint.bg, color: tint.fg }}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: subject.color }} />
      <span className="truncate">{subject.name}</span>
    </span>
  );
}

function SortableColumn(props: { subject: SubjectDTO; filter: (l: LessonDTO) => boolean; filtering: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: props.subject.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx("flex min-h-0", isDragging && "opacity-40")}>
      <SubjectColumn {...props} handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }} />
    </div>
  );
}

function SubjectColumn({
  subject,
  filter,
  filtering,
  handle,
}: {
  subject: SubjectDTO;
  filter: (l: LessonDTO) => boolean;
  filtering: boolean;
  handle: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> };
}) {
  const { data: lessons, isLoading } = useLessons(subject.id);
  const reorder = useReorder(subject.id);
  const updateSubject = useUpdateSubject();
  const qc = useQueryClient();
  const toast = useToast();
  const [showDone, setShowDone] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const { done, shown } = useMemo(() => {
    const all = lessons ?? [];
    return { done: all.filter((l) => l.status === "done"), shown: all.filter((l) => l.status !== "done" && filter(l)) };
  }, [lessons, filter]);

  const items = showDone && !filtering ? [...done, ...shown] : shown;
  const active = lessons?.find((l) => l.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    lastDragEnd = Date.now();
    if (!lessons || !e.over || e.active.id === e.over.id) return;
    const prevIds = lessons.map((l) => l.id);
    const from = prevIds.indexOf(String(e.active.id));
    const to = prevIds.indexOf(String(e.over.id));
    const nextIds = arrayMove(prevIds, from, to);
    const moved = lessons[from];
    const target = lessons[to];
    // Optimistic: reorder locally; the server re-binds slots and returns the truth.
    qc.setQueryData<LessonDTO[]>(keys.lessons(subject.id), arrayMove(lessons, from, to).map((l, i) => ({ ...l, sequenceOrder: i })));
    reorder.mutate(nextIds, {
      onSuccess: () =>
        toast({
          kind: "info",
          text: `${moved.title ? `“${moved.title}”` : "Lesson"} moved to ${target.slot ? fmtDay(target.slot.startTime) : `position ${to + 1}`}`,
          action: { label: "Undo", run: () => reorder.mutate(prevIds) },
        }),
      onError: (err) => {
        qc.setQueryData(keys.lessons(subject.id), lessons);
        toast({ kind: "error", text: err.message });
      },
    });
  };

  const labelOf = (id: string | number | undefined) => {
    const l = lessons?.find((x) => x.id === id);
    return l ? `${lessonLabel(l)}${l.slot ? ` on ${fmtDay(l.slot.startTime)}` : ""}` : "lesson";
  };
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${labelOf(active.id)} is over ${labelOf(over.id)}.` : `${labelOf(active.id)} is not over a lesson.`,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${labelOf(active.id)} dropped at the slot of ${labelOf(over.id)}.` : `${labelOf(active.id)} dropped.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Moving ${labelOf(active.id)} was cancelled.`,
  };

  const st = subject.stats;
  return (
    <section data-subject={subject.id} className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface" aria-label={`${subject.name} lessons`}>
      <header className="group/col px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-1.5">
          <button
            ref={handle.ref}
            {...handle.props}
            aria-label={`Move ${subject.name} column. Space to lift, arrows to move.`}
            title="Drag to reorder columns"
            className="-ml-1 flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
          <label className="relative min-w-0 cursor-pointer" title="Change color">
            <ColumnTitle subject={subject} />
            <input type="color" value={subject.color} onChange={(e) => updateSubject.mutate({ id: subject.id, color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${subject.name} color`} />
          </label>
          {subject.kind === "special" && <span className="rounded bg-hover px-1.5 py-px text-[10px] font-medium text-muted">Special</span>}
          <span className="text-xs text-faint tabular-nums">{shown.length}</span>
          <IconButton label={`Hide ${subject.name}`} className="ml-auto size-6" onClick={() => updateSubject.mutate({ id: subject.id, isVisible: false })}>
            <EyeOff className="size-3.5" />
          </IconButton>
        </div>
        <div className="mt-2.5">
          <ProgressBar
            thin
            total={st.totalSlots}
            label={`${st.completed} of ${st.totalSlots} lessons done`}
            segments={[
              { value: st.completed, color: "var(--success)", label: `${st.completed} completed` },
              { value: Math.max(0, st.planned), color: subject.color, label: `${st.planned} planned` },
            ]}
          />
          <div className="mt-1 flex justify-between text-[11px] text-faint tabular-nums">
            <span>{st.completed} done</span>
            <span>{st.planned} planned</span>
            <span>{st.remainingSlots} left</span>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="mb-2 h-40" />)}
        {done.length > 0 && !filtering && (
          <button onClick={() => setShowDone((v) => !v)} className="mb-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-faint hover:bg-hover hover:text-muted">
            {showDone ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {showDone ? "Hide" : "Show"} {done.length} completed lesson{done.length > 1 ? "s" : ""}
          </button>
        )}
        {!isLoading && lessons?.length === 0 && (
          <Empty title={subject.kind === "special" ? "No events in this column yet" : "No slots found for this subject"}>
            {subject.kind === "special" ? "Use Categories to drag events like “Fagdag” here." : "Check Categories or the calendar filters."}
          </Empty>
        )}
        {!isLoading && !!lessons?.length && items.length === 0 && <Empty title="Nothing matches the filters" />}
        <DndContext
          accessibility={{ announcements }}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <SortableContext items={items.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {items.map((l) => (
                <SortableCard key={l.id} lesson={l} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>{active ? <LessonCard lesson={active} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}

function SortableCard({ lesson }: { lesson: LessonDTO }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && "opacity-30")}>
      <LessonCard lesson={lesson} handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }} />
    </div>
  );
}

/* ---------------------------------------------------------------- By day */

function DayBoard({ weekStart, filter }: { weekStart: Date; filter: (l: LessonDTO) => boolean }) {
  const from = isoDate(weekStart);
  const to = isoDate(addDays(weekStart, 6));
  const { data, isLoading } = useLessonRange(from, to);
  const today = isoDate(new Date());

  const days = useMemo(() => {
    const byDay = new Map<string, DayLesson[]>();
    for (const l of data ?? []) {
      if (!l.slot || !filter(l)) continue;
      const d = isoDate(new Date(l.slot.startTime));
      byDay.set(d, [...(byDay.get(d) ?? []), l]);
    }
    // Weekdays always; weekend days only when something is scheduled.
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      .map((d) => ({ date: d, iso: isoDate(d), lessons: byDay.get(isoDate(d)) ?? [] }))
      .filter((d, i) => i < 5 || d.lessons.length > 0);
  }, [data, filter, weekStart]);

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
      {days.map((d) => (
        <section key={d.iso} className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface" aria-label={d.date.toDateString()}>
          <header className="flex items-baseline gap-2 px-3 pt-3 pb-2.5">
            <h2 className={cx("text-[13px] font-semibold", d.iso === today && "text-accent")}>{d.date.toLocaleDateString("en-GB", { weekday: "long" })}</h2>
            <span className="text-xs text-faint">{d.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            {d.iso === today && <span className="rounded-full bg-accent-soft px-1.5 text-[10px] leading-4 font-semibold text-accent">Today</span>}
            <span className="ml-auto text-xs text-faint tabular-nums">{d.lessons.length}</span>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {isLoading && [0, 1].map((i) => <Skeleton key={i} className="mb-2 h-40" />)}
            {!isLoading && d.lessons.length === 0 && <div className="px-2 py-6 text-center text-xs text-faint">No lessons</div>}
            <div className="flex flex-col gap-2">
              {d.lessons.map((l) => (
                <LessonCard key={l.id} lesson={l} subject={{ name: l.subjectName, color: l.subjectColor }} showTime />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Card */

export function LessonCard({
  lesson,
  dragging,
  handle,
  subject,
  showTime,
}: {
  lesson: LessonDTO;
  dragging?: boolean;
  handle?: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> };
  /** Day view: show which subject the lesson belongs to. */
  subject?: { name: string; color: string };
  /** Day view: lead with the time range instead of the date. */
  showTime?: boolean;
}) {
  const { openLesson } = useNav();
  const { isExpanded, toggle } = useContext(ExpandContext);
  const expanded = !dragging && isExpanded(lesson.id);
  const isDone = lesson.status === "done";
  const preview = mdPreview(lesson.bodyText);
  const homework = lesson.homeworkText?.trim() ?? "";
  const hasFiles = lesson.files.total > 0;
  const releaseDate =
    lesson.slot && homework && lesson.homeworkOffset != null ? new Date(new Date(lesson.slot.startTime).getTime() - lesson.homeworkOffset * 86_400_000) : null;
  const { data: allFiles } = useLessonFiles(lesson.id, expanded && lesson.files.total > lesson.files.names.length);
  const fileNames = expanded && allFiles ? allFiles.files.map((f) => f.name) : lesson.files.names;

  // "Show more" appears only when something in the collapsed card is actually cut off.
  const planRef = useRef<HTMLParagraphElement>(null);
  const hwRef = useRef<HTMLParagraphElement>(null);
  const filesRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    if (expanded) return;
    const over = (el: HTMLElement | null) => !!el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    const check = () => setClipped(over(planRef.current) || over(hwRef.current) || over(filesRef.current) || lesson.files.total > lesson.files.names.length);
    check();
    const ro = new ResizeObserver(check);
    [planRef.current, hwRef.current, filesRef.current].forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [expanded, preview, homework, lesson.files]);
  const canToggle = expanded || clipped;

  const open = () => {
    if (dragging || Date.now() - lastDragEnd < 250) return;
    openLesson(lesson.id);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Edit ${lessonLabel(lesson)}${lesson.slot ? `, ${fmtDay(lesson.slot.startTime)}` : ""}`}
      onClick={open}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          open();
        }
      }}
      className={cx(
        "group cursor-pointer rounded-lg border bg-raised text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
        dragging ? "rotate-2 border-line-strong shadow-float" : "border-line shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-line-strong hover:shadow-sm",
        isDone && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        {handle && (
          <button
            ref={handle.ref}
            {...handle.props}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Reorder ${lessonLabel(lesson)}. Space to lift, arrows to move.`}
            className="-ml-1.5 flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        {subject && <SubjectTag name={subject.name} color={subject.color} />}
        <span className="truncate text-[11px] text-muted">
          {!lesson.slot
            ? "Unscheduled"
            : showTime
              ? `${fmtTime(lesson.slot.startTime)}–${fmtTime(lesson.slot.endTime)}`
              : `${fmtShortDay(lesson.slot.startTime)} · ${fmtTime(lesson.slot.startTime)}`}
        </span>
        {lesson.slot?.room && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-faint">
            <MapPin className="size-3" />
            {lesson.slot.room}
          </span>
        )}
        <span className="ml-auto shrink-0">
          <StatusBadge status={lesson.status} />
        </span>
      </div>

      {lesson.title && <h3 className="truncate px-3 pt-1 text-[14px] font-semibold">{lesson.title}</h3>}

      <div className="space-y-2 px-3 pt-2 pb-2.5">
        <Section icon={<FileText className="size-3.5" />} label="Plan">
          {!preview ? (
            <p className="text-[12px] leading-[18px] text-faint italic">No plan yet</p>
          ) : expanded ? (
            <div className="prose-lesson prose-card">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.bodyText}</ReactMarkdown>
            </div>
          ) : (
            <p ref={planRef} className="line-clamp-3 max-h-[54px] text-[12px] leading-[18px] whitespace-pre-line text-muted">
              {preview}
            </p>
          )}
        </Section>
        {homework && (
          <Section
            icon={<BookOpen className="size-3.5" />}
            label="Homework"
            aside={
              releaseDate && (
                <span className={cx("inline-flex items-center gap-1 text-[11px]", lesson.homeworkPostedAt ? "text-success" : "text-faint")}>
                  <Sparkles className="size-3" />
                  {lesson.homeworkPostedAt ? "Posted" : `Post ${fmtShortDay(releaseDate.toISOString())}`}
                </span>
              )
            }
          >
            <p ref={hwRef} className={cx("text-[12px] leading-[18px] text-muted", expanded ? "whitespace-pre-line" : "truncate")}>
              {homework}
            </p>
          </Section>
        )}
        {hasFiles && (
          <Section icon={<Paperclip className="size-3.5" />} label="Files" aside={<span className="text-[11px] text-faint tabular-nums">{lesson.files.total}</span>}>
            {expanded ? (
              <ul className="space-y-0.5">
                {fileNames.map((n) => (
                  <li key={n} className="truncate text-[12px] leading-[18px] text-muted">
                    {n}
                  </li>
                ))}
              </ul>
            ) : (
              <p ref={filesRef} className="truncate text-[12px] leading-[18px] text-muted">
                {lesson.files.names.join(", ")}
                {lesson.files.total > lesson.files.names.length && ` +${lesson.files.total - lesson.files.names.length}`}
              </p>
            )}
          </Section>
        )}
      </div>

      {(lesson.openTaskCount > 0 || (canToggle && !dragging)) && (
        <div className="flex h-8 items-center gap-2 border-t border-line px-3">
          {lesson.openTaskCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-faint" title={`${lesson.openTaskCount} open task(s)`}>
              <ListTodo className="size-3" /> {lesson.openTaskCount} task{lesson.openTaskCount > 1 ? "s" : ""}
            </span>
          )}
          {canToggle && !dragging && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(lesson.id);
              }}
              aria-expanded={expanded}
              className="ml-auto inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-faint hover:bg-hover hover:text-fg"
            >
              {expanded ? "Show less" : "Show more"}
              <ChevronDown className={cx("size-3 transition-transform", expanded && "rotate-180")} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Section({ icon, label, aside, children }: { icon: React.ReactNode; label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 flex h-4 items-center gap-1 text-[10px] font-semibold tracking-wide text-faint uppercase">
        {icon}
        {label}
        {aside && <span className="ml-auto font-normal tracking-normal normal-case">{aside}</span>}
      </div>
      {children}
    </div>
  );
}
