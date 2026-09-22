import { useEffect, useMemo, useRef, useState } from "react";
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
import { BookOpen, Bus, ChevronDown, ChevronRight, ClipboardCheck, EyeOff, FlaskConical, FolderOpen, GripVertical, ListTodo, MapPin, Puzzle, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { LessonDTO, LessonStatus, LessonType, SubjectDTO } from "../../shared/types";
import { keys, useLessons, useReorder, useSubjects, useUpdateSubject } from "../api";
import { useNav } from "../nav";
import { fmtDay, fmtSlot, fmtTime } from "../lib/format";
import { lessonLabel } from "../../shared/planning";
import { cx, Empty, IconButton, ProgressBar, Skeleton, StatusBadge, ToggleChip } from "../components/ui";
import { useToast } from "../components/toast";

export const LESSON_TYPE_ICON: Record<LessonType, typeof BookOpen> = {
  standard: BookOpen,
  lab: FlaskConical,
  test: ClipboardCheck,
  excursion: Bus,
  project: Puzzle,
};

const STATUS_FILTERS: { status: LessonStatus; label: string }[] = [
  { status: "needs-plan", label: "Needs plan" },
  { status: "unplanned", label: "Unplanned" },
  { status: "planned", label: "Planned" },
  { status: "no-slot", label: "Unscheduled" },
];

export function KanbanBoard() {
  const { data: subjects, isLoading } = useSubjects();
  const { focusSubjectId } = useNav();
  const [statusFilter, setStatusFilter] = useState<Set<LessonStatus>>(new Set());
  const [next14, setNext14] = useState(false);
  const visible = subjects?.filter((s) => s.isVisible) ?? [];
  const hiddenCount = (subjects?.length ?? 0) - visible.length;
  const board = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSubjectId) board.current?.querySelector(`[data-subject="${focusSubjectId}"]`)?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }, [focusSubjectId, subjects]);

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
        <span className="mr-1 text-[11px] font-medium tracking-wide text-faint uppercase">Show</span>
        {STATUS_FILTERS.map((f) => (
          <ToggleChip key={f.status} pressed={statusFilter.has(f.status)} onClick={() => toggleStatus(f.status)}>
            {f.label}
          </ToggleChip>
        ))}
        <span className="mx-1 h-4 w-px bg-line" />
        <ToggleChip pressed={next14} onClick={() => setNext14((v) => !v)}>
          Next 14 days
        </ToggleChip>
        {hiddenCount > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-faint">
            <EyeOff className="size-3.5" /> {hiddenCount} hidden column{hiddenCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div ref={board} className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {isLoading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="flex w-[300px] shrink-0 flex-col gap-2">
              <Skeleton className="h-10" />
              {[0, 1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-20" />
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
    </div>
  );
}

function SubjectColumn({ subject, statusFilter, next14 }: { subject: SubjectDTO; statusFilter: Set<LessonStatus>; next14: boolean }) {
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
  const numberOf = (l: LessonDTO) => l.sequenceOrder + 1;

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
  return (
    <section data-subject={subject.id} className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-[10px] border border-line bg-surface" aria-label={`${subject.name} lessons`}>
      <header className="border-b border-line px-3 pt-2.5 pb-2" style={{ boxShadow: `inset 0 3px 0 ${subject.color}` }}>
        <div className="flex items-center gap-2">
          <label className="relative size-3 shrink-0 cursor-pointer rounded-full" style={{ background: subject.color }} title="Change color">
            <input
              type="color"
              value={subject.color}
              onChange={(e) => updateSubject.mutate({ id: subject.id, color: e.target.value })}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`${subject.name} color`}
            />
          </label>
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{subject.name}</h2>
          <span className="text-[11px] text-faint tabular-nums">{lessons?.length ?? "–"}</span>
          <IconButton label={`Hide ${subject.name}`} className="size-6" onClick={() => updateSubject.mutate({ id: subject.id, isVisible: false })}>
            <EyeOff className="size-3.5" />
          </IconButton>
        </div>
        <div className="mt-2">
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="mb-2 h-20" />)}
        {done.length > 0 && !statusFilter.size && !next14 && (
          <button onClick={() => setShowDone((v) => !v)} className="mb-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-faint hover:bg-hover hover:text-muted">
            {showDone ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {showDone ? "Hide" : "Show"} {done.length} completed lesson{done.length > 1 ? "s" : ""}
          </button>
        )}
        {!isLoading && lessons?.length === 0 && <Empty title="No slots found for this subject">Check your calendar filters or ignored events.</Empty>}
        {!isLoading && !!lessons?.length && items.length === 0 && <Empty title="Nothing matches the filters" />}
        <DndContext accessibility={{ announcements }} sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <SortableContext items={items.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1.5">
              {items.map((l) => (
                <SortableCard key={l.id} lesson={l} number={numberOf(l)} />
              ))}
            </div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
            {active ? <LessonCard lesson={active} number={numberOf(active)} dragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </section>
  );
}

function SortableCard({ lesson, number }: { lesson: LessonDTO; number: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && "opacity-30")}>
      <LessonCard lesson={lesson} number={number} handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }} />
    </div>
  );
}

export function LessonCard({
  lesson,
  number,
  dragging,
  handle,
}: {
  lesson: LessonDTO;
  number: number;
  dragging?: boolean;
  handle?: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> };
}) {
  const { openLesson } = useNav();
  const TypeIcon = LESSON_TYPE_ICON[lesson.lessonType] ?? BookOpen;
  const isDone = lesson.status === "done";
  const releaseDate =
    lesson.slot && lesson.homeworkText && lesson.homeworkOffset != null
      ? new Date(new Date(lesson.slot.startTime).getTime() - lesson.homeworkOffset * 86_400_000)
      : null;

  return (
    <div
      className={cx(
        "group relative rounded-md border bg-raised px-2 py-2 transition-colors",
        dragging ? "rotate-2 border-line-strong opacity-95 shadow-float" : "border-line hover:border-line-strong",
        lesson.status === "needs-plan" && !dragging && "border-l-2 border-l-warning",
        isDone && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          ref={handle?.ref}
          {...(handle?.props ?? {})}
          aria-label={`Reorder lesson ${number}: ${lessonLabel(lesson)}. Space to lift, arrows to move.`}
          className="-ml-0.5 flex h-5 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint opacity-40 group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <button onClick={() => openLesson(lesson.id)} className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left">
          <span className="font-mono text-[11px] text-faint">#{number}</span>
          <span className={cx("truncate text-[13px] font-medium", !lesson.title && "text-muted")}>{lessonLabel(lesson)}</span>
        </button>
        <TypeIcon className="size-3.5 shrink-0 text-faint" aria-label={lesson.lessonType} />
      </div>
      <button onClick={() => openLesson(lesson.id)} className="mt-1 block w-full pl-4 text-left" tabIndex={-1}>
        <div className="flex items-center gap-2 font-mono text-[11px] text-muted">
          {lesson.slot ? fmtSlot(lesson.slot.startTime, lesson.slot.endTime) : "No calendar slot"}
          {lesson.slot?.room && (
            <span className="inline-flex items-center gap-0.5 font-sans text-faint">
              <MapPin className="size-3" />
              {lesson.slot.room}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={lesson.status} />
          {releaseDate && (
            <span className={cx("inline-flex items-center gap-1 text-[11px]", lesson.homeworkPostedAt ? "text-success" : "text-faint")} title={lesson.homeworkPostedAt ? "Homework posted" : `Homework release ${fmtDay(releaseDate)}`}>
              <Sparkles className="size-3" />
              {lesson.homeworkPostedAt ? "HW posted" : `HW ${fmtDay(releaseDate)}`}
            </span>
          )}
          {lesson.folderPath && <FolderOpen className="size-3 text-faint" aria-label="Has folder" />}
          {lesson.openTaskCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-faint" title={`${lesson.openTaskCount} open task(s)`}>
              <ListTodo className="size-3" /> {lesson.openTaskCount}
            </span>
          )}
          {lesson.slot && isDone && <span className="text-[11px] text-faint">{fmtTime(lesson.slot.startTime)}</span>}
        </div>
      </button>
    </div>
  );
}
