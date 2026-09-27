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
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { EyeOff, ListTodo } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { LessonDTO, SubjectDTO } from "../../shared/types";
import { keys, useLessonRange, useLessons, useReorder, useReorderSubjects, useSettings, useSubjects, useUpdateSubject, type DayLesson } from "../api";
import { useNav } from "../nav";
import { addDays, isoDate, isoWeek, startOfWeek } from "../lib/format";
import { BoardToolbar } from "../ui/BoardToolbar";
import { KanbanColumn } from "../ui/KanbanColumn";
import { DayColumn } from "../ui/DayColumn";
import { LessonCard } from "../ui/LessonCard";
import { longDate } from "../ui/format";
import type { BoardView, StatusFilter } from "../ui/types";
import { Empty, Skeleton } from "../components/ui";
import { useToast } from "../components/toast";

/** Set when any drag ends, so the click that follows a drop doesn't open the lesson. */
let lastDragEnd = 0;

function readView(): BoardView {
  try {
    return localStorage.getItem("boardMode") === "day" ? "day" : "subject";
  } catch {
    return "subject";
  }
}

export function KanbanBoard() {
  const { data: settings } = useSettings();
  const { openCategories } = useNav();
  const [view, setViewState] = useState<BoardView>(readView);
  const [filters, setFilters] = useState<StatusFilter[]>([]);
  const [next14, setNext14] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const setView = (v: BoardView) => {
    setViewState(v);
    try {
      localStorage.setItem("boardMode", v);
    } catch {
      /* per-session only */
    }
  };

  const isExpanded = (id: string) => allExpanded !== exceptions.has(id);
  const toggleExpand = (id: string) =>
    setExceptions((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setAll = (v: boolean) => {
    setAllExpanded(v);
    setExceptions(new Set());
  };

  const filter = useMemo(
    () => (l: LessonDTO) => {
      if (filters.length && !filters.includes(l.status as StatusFilter)) return false;
      if (next14 && (!l.slot || new Date(l.slot.startTime).getTime() > Date.now() + 14 * 86_400_000)) return false;
      return true;
    },
    [filters, next14],
  );

  const cards = { isExpanded, toggleExpand };
  return (
    <div className="flex h-full flex-col">
      <BoardToolbar
        view={view}
        onViewChange={setView}
        filters={filters}
        onToggleFilter={(f) => setFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]))}
        next14={next14}
        onToggleNext14={() => setNext14((v) => !v)}
        weekNumber={isoWeek(weekStart)}
        onPrevWeek={() => setWeekStart(addDays(weekStart, -7))}
        onNextWeek={() => setWeekStart(addDays(weekStart, 7))}
        onToday={() => setWeekStart(startOfWeek(new Date()))}
        expandState={exceptions.size ? "mixed" : allExpanded ? "expanded" : "collapsed"}
        onCollapseAll={() => setAll(false)}
        onExpandAll={() => setAll(true)}
        newCategoryCount={settings?.pendingSources ?? 0}
        onOpenCategories={openCategories}
      />
      {view === "subject" ? (
        <SubjectBoard filter={filter} cards={cards} />
      ) : (
        <DayBoard weekStart={weekStart} filter={filter} cards={cards} />
      )}
    </div>
  );
}

interface CardState {
  isExpanded: (id: string) => boolean;
  toggleExpand: (id: string) => void;
}

/* ---------------------------------------------------------------- By subject */

function SubjectBoard({ filter, cards }: { filter: (l: LessonDTO) => boolean; cards: CardState }) {
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
      <div className="flex gap-3 px-5 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex w-[320px] shrink-0 flex-col gap-2">
            <Skeleton className="h-16" />
            {[0, 1, 2].map((j) => (
              <Skeleton key={j} className="h-32" />
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

  return (
    <div ref={board} className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pt-1 pb-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e) => setActiveCol(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveCol(null)}>
        <SortableContext items={visible.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          {visible.map((s) => (
            <SortableColumn key={s.id} subject={s} filter={filter} cards={cards} isDragging={activeCol === s.id} />
          ))}
        </SortableContext>
        <DragOverlay />
      </DndContext>
      {hiddenCount > 0 && (
        <div className="flex w-8 shrink-0 items-start justify-center pt-4 text-text-faint" title={`${hiddenCount} hidden column(s). Show them from the sidebar.`}>
          <EyeOff size={15} />
        </div>
      )}
    </div>
  );
}

function SortableColumn({
  subject,
  filter,
  cards,
  isDragging,
}: {
  subject: SubjectDTO;
  filter: (l: LessonDTO) => boolean;
  cards: CardState;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: subject.id });
  const { data: lessons, isLoading } = useLessons(subject.id);
  const reorder = useReorder(subject.id);
  const updateSubject = useUpdateSubject();
  const qc = useQueryClient();
  const toast = useToast();
  const { openLesson } = useNav();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const { done, shown } = useMemo(() => {
    const all = lessons ?? [];
    return { done: all.filter((l) => l.status === "done"), shown: all.filter((l) => l.status !== "done" && filter(l)) };
  }, [lessons, filter]);
  const active = lessons?.find((l) => l.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    lastDragEnd = Date.now();
    if (!lessons || !e.over || e.active.id === e.over.id) return;
    const prevIds = lessons.map((l) => l.id);
    const from = prevIds.indexOf(String(e.active.id));
    const to = prevIds.indexOf(String(e.over.id));
    const moved = lessons[from];
    const target = lessons[to];
    // Optimistic: reorder locally; the server re-binds slots and returns the truth.
    qc.setQueryData<LessonDTO[]>(keys.lessons(subject.id), arrayMove(lessons, from, to).map((l, i) => ({ ...l, sequenceOrder: i })));
    reorder.mutate(arrayMove(prevIds, from, to), {
      onSuccess: () =>
        toast({
          kind: "info",
          text: `${moved.title ? `“${moved.title}”` : "Lesson"} moved to ${target.slot ? longDate(target.slot.startTime) : `position ${to + 1}`}`,
          action: { label: "Undo", run: () => reorder.mutate(prevIds) },
        }),
      onError: (err) => {
        qc.setQueryData(keys.lessons(subject.id), lessons);
        toast({ kind: "error", text: err.message });
      },
    });
  };

  const card = (l: LessonDTO) => (
    <SortableCard key={l.id} lesson={l} cards={cards} onOpen={openLesson} />
  );

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={isDragging ? "opacity-40" : undefined}>
      <KanbanColumn
        subject={subject}
        cardCount={shown.length}
        completedOpen={completedOpen}
        onToggleCompleted={() => setCompletedOpen((v) => !v)}
        onHide={() => updateSubject.mutate({ id: subject.id, isVisible: false })}
        dragHandleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef } as React.HTMLAttributes<HTMLElement>}
        isDragging={isDragging}
        completed={done.map(card)}
      >
        <div data-subject={subject.id} />
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
        {!isLoading && lessons?.length === 0 && (
          <p className="px-2 py-6 text-center text-[12px] text-text-faint">
            {subject.kind === "special" ? "No events here yet. Use Categories to move events like “Fagdag” in." : "No slots found. Check Categories or the calendar filters."}
          </p>
        )}
        {!isLoading && !!lessons?.length && shown.length === 0 && !completedOpen && <p className="px-2 py-6 text-center text-[12px] text-text-faint">Nothing matches the filters</p>}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <SortableContext items={shown.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">{shown.map(card)}</div>
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>
            {active ? <LessonCard lesson={active} expanded={cards.isExpanded(active.id)} onOpen={() => {}} onToggleExpand={() => {}} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </KanbanColumn>
    </div>
  );
}

function SortableCard({ lesson, cards, onOpen }: { lesson: LessonDTO; cards: CardState; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? "opacity-30" : undefined}>
      <LessonCard
        lesson={lesson}
        expanded={cards.isExpanded(lesson.id)}
        onOpen={() => Date.now() - lastDragEnd > 250 && onOpen(lesson.id)}
        onToggleExpand={cards.toggleExpand}
        dragHandleProps={{ ...attributes, ...listeners, ref: setActivatorNodeRef } as React.HTMLAttributes<HTMLElement>}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- By day */

function DayBoard({ weekStart, filter, cards }: { weekStart: Date; filter: (l: LessonDTO) => boolean; cards: CardState }) {
  const from = isoDate(weekStart);
  const to = isoDate(addDays(weekStart, 6));
  const { data, isLoading } = useLessonRange(from, to);
  const { openLesson } = useNav();
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
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pt-1 pb-4">
      {days.map((d) => (
        <DayColumn
          key={d.iso}
          weekday={d.date.toLocaleDateString("en-GB", { weekday: "long" })}
          date={d.date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          isToday={d.iso === today}
          count={d.lessons.length}
        >
          {isLoading && [0, 1].map((i) => <Skeleton key={i} className="h-32" />)}
          {!isLoading && d.lessons.length === 0 && <p className="px-2 py-6 text-center text-[12px] text-text-faint">No lessons</p>}
          {d.lessons.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              mode="day"
              subject={{ name: l.subjectName, color: l.subjectColor }}
              expanded={cards.isExpanded(l.id)}
              onOpen={openLesson}
              onToggleExpand={cards.toggleExpand}
            />
          ))}
        </DayColumn>
      ))}
    </div>
  );
}
