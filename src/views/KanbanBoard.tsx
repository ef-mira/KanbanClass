import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
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
import { keys, useLessonFiles, useLessons, useReorder, useSettings, useSubjects, useUpdateSubject } from "../api";
import { useNav } from "../nav";
import { fmtDay, fmtShortDay, fmtTime, mdPreview, subjectTint } from "../lib/format";
import { lessonLabel } from "../../shared/planning";
import { useIsDark } from "../lib/theme";
import { cx, Empty, IconButton, ProgressBar, Skeleton, StatusBadge, ToggleChip } from "../components/ui";
import { useToast } from "../components/toast";

const STATUS_FILTERS: { status: LessonStatus; label: string }[] = [
  { status: "needs-plan", label: "Needs plan" },
  { status: "unplanned", label: "Unplanned" },
  { status: "planned", label: "Planned" },
  { status: "no-slot", label: "Unscheduled" },
];

/** Expand state: a board-wide default plus per-card exceptions. */
interface ExpandState {
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
}
const ExpandContext = createContext<ExpandState>({ isExpanded: () => false, toggle: () => {} });

export function KanbanBoard() {
  const { data: subjects, isLoading } = useSubjects();
  const { data: settings } = useSettings();
  const { focusSubjectId, openCategories } = useNav();
  const [statusFilter, setStatusFilter] = useState<Set<LessonStatus>>(new Set());
  const [next14, setNext14] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const visible = subjects?.filter((s) => s.isVisible) ?? [];
  const hiddenCount = (subjects?.length ?? 0) - visible.length;
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSubjectId) board.current?.querySelector(`[data-subject="${focusSubjectId}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [focusSubjectId, subjects]);

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        {STATUS_FILTERS.map((f) => (
          <ToggleChip key={f.status} pressed={statusFilter.has(f.status)} onClick={() => toggleStatus(f.status)}>
            {f.label}
          </ToggleChip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <ToggleChip pressed={next14} onClick={() => setNext14((v) => !v)}>
          Next 14 days
        </ToggleChip>

        <div className="ml-auto flex items-center gap-2">
          {hiddenCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-faint">
              <EyeOff className="size-3.5" /> {hiddenCount} hidden
            </span>
          )}
          <div className="flex rounded-md border border-line bg-raised p-0.5" role="group" aria-label="Card size">
            <button
              onClick={() => setAll(false)}
              aria-pressed={!allExpanded && exceptions.size === 0}
              className={cx("flex h-6 items-center gap-1 rounded px-2 text-xs", !allExpanded && exceptions.size === 0 ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg")}
            >
              <ChevronsDownUp className="size-3.5" /> Collapse all
            </button>
            <button
              onClick={() => setAll(true)}
              aria-pressed={allExpanded && exceptions.size === 0}
              className={cx("flex h-6 items-center gap-1 rounded px-2 text-xs", allExpanded && exceptions.size === 0 ? "bg-hover font-medium text-fg" : "text-muted hover:text-fg")}
            >
              <ChevronsUpDown className="size-3.5" /> Expand all
            </button>
          </div>
          <button onClick={openCategories} className="flex h-7 items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 text-xs font-medium text-muted hover:border-line-strong hover:text-fg">
            <Layers className="size-3.5" /> Categories
            {!!settings?.pendingSources && <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">{settings.pendingSources} new</span>}
          </button>
        </div>
      </div>

      <ExpandContext.Provider value={expand}>
        <div ref={board} className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
          {isLoading &&
            [0, 1, 2].map((i) => (
              <div key={i} className="flex w-[320px] shrink-0 flex-col gap-2">
                <Skeleton className="h-14" />
                {[0, 1, 2].map((j) => (
                  <Skeleton key={j} className="h-44" />
                ))}
              </div>
            ))}
          {!isLoading && visible.length === 0 && (
            <div className="flex-1">
              <Empty icon={<ListTodo className="size-6" />} title={subjects?.length ? "All subject columns are hidden" : "No subjects yet"}>
                {subjects?.length ? "Use the eye toggles in the sidebar to show columns." : "Sync your calendar in Calendar & settings. Subjects are created from your timetable."}
              </Empty>
            </div>
          )}
          {visible.map((s) => (
            <SubjectColumn key={s.id} subject={s} statusFilter={statusFilter} next14={next14} />
          ))}
        </div>
      </ExpandContext.Provider>
    </div>
  );
}

function SubjectColumn({ subject, statusFilter, next14 }: { subject: SubjectDTO; statusFilter: Set<LessonStatus>; next14: boolean }) {
  const { data: lessons, isLoading } = useLessons(subject.id);
  const reorder = useReorder(subject.id);
  const updateSubject = useUpdateSubject();
  const qc = useQueryClient();
  const toast = useToast();
  const dark = useIsDark();
  const [showDone, setShowDone] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const { done, shown } = useMemo(() => {
    const all = lessons ?? [];
    const horizon = Date.now() + 14 * 86_400_000;
    const done = all.filter((l) => l.status === "done");
    const shown = all.filter((l) => {
      if (l.status === "done") return false;
      if (statusFilter.size && !statusFilter.has(l.status)) return false;
      if (next14 && (!l.slot || new Date(l.slot.startTime).getTime() > horizon)) return false;
      return true;
    });
    return { done, shown };
  }, [lessons, statusFilter, next14]);

  const items = showDone && !statusFilter.size && !next14 ? [...done, ...shown] : shown;
  const active = lessons?.find((l) => l.id === activeId) ?? null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
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
          text: `${moved.title ? `“${moved.title}”` : `Lesson #${from + 1}`} moved to ${target.slot ? fmtDay(target.slot.startTime) : `position #${to + 1}`}`,
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
    return l ? `${lessonLabel(l)}${l.slot ? ` (${fmtDay(l.slot.startTime)})` : ""}` : "lesson";
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
  const tint = subjectTint(subject.color, dark);
  return (
    <section data-subject={subject.id} className="flex w-[320px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface" aria-label={`${subject.name} lessons`}>
      <header className="px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex h-6 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-semibold tracking-wide uppercase" style={{ background: tint.bg, color: tint.fg }} title="Change color">
            <span className="size-2 shrink-0 rounded-full" style={{ background: subject.color }} />
            <span className="truncate">{subject.name}</span>
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
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="mb-2 h-44" />)}
        {done.length > 0 && !statusFilter.size && !next14 && (
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
        <DndContext accessibility={{ announcements }} sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
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

export function LessonCard({ lesson, dragging, handle }: { lesson: LessonDTO; dragging?: boolean; handle?: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> } }) {
  const { openLesson } = useNav();
  const { isExpanded, toggle } = useContext(ExpandContext);
  const expanded = !dragging && isExpanded(lesson.id);
  const number = lesson.sequenceOrder + 1;
  const isDone = lesson.status === "done";
  const preview = mdPreview(lesson.bodyText);
  const releaseDate =
    lesson.slot && lesson.homeworkText && lesson.homeworkOffset != null ? new Date(new Date(lesson.slot.startTime).getTime() - lesson.homeworkOffset * 86_400_000) : null;
  const { data: allFiles } = useLessonFiles(lesson.id, expanded && lesson.files.total > lesson.files.names.length);
  const fileNames = expanded && allFiles ? allFiles.files.map((f) => f.name) : lesson.files.names;

  return (
    <article
      className={cx(
        "group rounded-lg border bg-raised transition-[border-color,box-shadow]",
        dragging ? "rotate-2 border-line-strong shadow-float" : "border-line shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-line-strong hover:shadow-sm",
        isDone && "opacity-60",
      )}
    >
      {/* Header: number, date, status */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5">
        <button
          ref={handle?.ref}
          {...(handle?.props ?? {})}
          aria-label={`Reorder lesson ${number}: ${lessonLabel(lesson)}. Space to lift, arrows to move.`}
          className="-ml-1.5 flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <span className="font-mono text-[11px] text-faint">#{number}</span>
        <span className="truncate text-[11px] text-muted">{lesson.slot ? `${fmtShortDay(lesson.slot.startTime)} · ${fmtTime(lesson.slot.startTime)}` : "Unscheduled"}</span>
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

      <button onClick={() => openLesson(lesson.id)} className="block w-full px-3 pt-1 text-left">
        <h3 className={cx("truncate text-[14px] font-semibold", !lesson.title && "text-muted")}>{lessonLabel(lesson)}</h3>
      </button>

      {/* Body: fixed-height previews when collapsed, full content when expanded */}
      <div className="space-y-2 px-3 pt-2 pb-2">
        <Section icon={<FileText className="size-3.5" />} label="Plan">
          {!preview ? (
            <Placeholder className="h-[54px]">No plan yet</Placeholder>
          ) : expanded ? (
            <div className="prose-lesson prose-card">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{lesson.bodyText}</ReactMarkdown>
            </div>
          ) : (
            <p className="line-clamp-3 h-[54px] text-[12px] leading-[18px] whitespace-pre-line text-muted">{preview}</p>
          )}
        </Section>
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
          {lesson.homeworkText?.trim() ? (
            <p className={cx("text-[12px] leading-[18px] text-muted", expanded ? "whitespace-pre-line" : "truncate")}>{lesson.homeworkText}</p>
          ) : (
            <Placeholder>No homework</Placeholder>
          )}
        </Section>
        <Section icon={<Paperclip className="size-3.5" />} label="Files" aside={lesson.files.total > 0 && <span className="text-[11px] text-faint tabular-nums">{lesson.files.total}</span>}>
          {lesson.files.total === 0 ? (
            <Placeholder>No files</Placeholder>
          ) : expanded ? (
            <ul className="space-y-0.5">
              {fileNames.map((n) => (
                <li key={n} className="truncate text-[12px] leading-[18px] text-muted">
                  {n}
                </li>
              ))}
            </ul>
          ) : (
            <p className="truncate text-[12px] leading-[18px] text-muted">
              {lesson.files.names.join(", ")}
              {lesson.files.total > lesson.files.names.length && ` +${lesson.files.total - lesson.files.names.length}`}
            </p>
          )}
        </Section>
      </div>

      <div className="flex h-8 items-center gap-2 border-t border-line px-3">
        {lesson.openTaskCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-faint" title={`${lesson.openTaskCount} open task(s)`}>
            <ListTodo className="size-3" /> {lesson.openTaskCount} task{lesson.openTaskCount > 1 ? "s" : ""}
          </span>
        )}
        {!dragging && (
          <button onClick={() => toggle(lesson.id)} aria-expanded={expanded} className="ml-auto inline-flex items-center gap-0.5 rounded px-1 text-[11px] text-faint hover:bg-hover hover:text-fg">
            {expanded ? "Show less" : "Show more"}
            <ChevronDown className={cx("size-3 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
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

function Placeholder({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx("text-[12px] leading-[18px] text-faint italic", className)}>{children}</p>;
}
