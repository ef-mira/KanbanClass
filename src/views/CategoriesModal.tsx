import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ArrowRightLeft, Ban, CalendarDays, GripVertical, Layers, Plus, Sparkles, Trash2 } from "lucide-react";
import type { CategoriesDTO, CategorySourceDTO, SubjectKind } from "../../shared/types";
import { useCategories, useSaveCategories } from "../api";
import { fmtDate } from "../lib/format";
import { Button, cx, Drawer, DrawerClose, Skeleton } from "../components/ui";
import { useToast } from "../components/toast";

const NONE = "__not_needed__";
const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#a855f7"];
const TYPE_LABEL: Record<string, string> = { lesson: "Lesson", meeting: "Meeting", supervision: "Duty", other: "Event", pause: "Pause" };

interface Column {
  id: string;
  name: string;
  color: string;
  kind: SubjectKind;
  plannedCount: number;
}

export function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useCategories(open);
  return (
    <Drawer open={open} onClose={onClose} placement="center" width={1280} label="Organize calendar categories">
      {!data ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <Editor data={data} onClose={onClose} />
      )}
    </Drawer>
  );
}

function Editor({ data, onClose }: { data: CategoriesDTO; onClose: () => void }) {
  const save = useSaveCategories();
  const toast = useToast();
  const [columns, setColumns] = useState<Column[]>(() => data.columns.map((c) => ({ ...c })));
  const [assign, setAssign] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.sources.map((s) => [s.id, s.isIgnored || !s.subjectId ? NONE : s.subjectId])),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newSeq, setNewSeq] = useState(1);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const newCount = data.sources.filter((s) => !s.reviewed).length;

  // Re-seed if the server data changes underneath (e.g. a sync finished while open).
  useEffect(() => {
    setColumns(data.columns.map((c) => ({ ...c })));
    setAssign(Object.fromEntries(data.sources.map((s) => [s.id, s.isIgnored || !s.subjectId ? NONE : s.subjectId])));
  }, [data]);

  const byColumn = useMemo(() => {
    const m = new Map<string, CategorySourceDTO[]>();
    for (const s of data.sources) {
      const col = assign[s.id] ?? NONE;
      m.set(col, [...(m.get(col) ?? []), s]);
    }
    // Lessons first, most events first, so the big subjects lead each column.
    for (const list of m.values()) list.sort((a, b) => Number(b.eventType === "lesson") - Number(a.eventType === "lesson") || b.eventCount - a.eventCount);
    return m;
  }, [data.sources, assign]);

  const move = (sourceId: string, columnId: string) => setAssign((a) => ({ ...a, [sourceId]: columnId }));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (e.over) move(String(e.active.id), String(e.over.id));
  };

  const addColumn = (kind: SubjectKind) => {
    const id = `new:${newSeq}`;
    setNewSeq((n) => n + 1);
    const base = kind === "special" ? "Special" : "New subject";
    let name = base;
    for (let n = 2; columns.some((c) => c.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;
    setColumns((cs) => [...cs, { id, name, color: kind === "special" ? "#64748b" : PALETTE[cs.length % PALETTE.length], kind, plannedCount: 0 }]);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-col-name="${id}"]`)?.select());
  };

  const removeColumn = (c: Column) => {
    if (c.plannedCount > 0 && !confirm(`“${c.name}” has ${c.plannedCount} planned lesson(s). They'll be kept as unscheduled lessons. Remove the column?`)) return;
    setAssign((a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v === c.id ? NONE : v])));
    setColumns((cs) => cs.filter((x) => x.id !== c.id));
  };

  const doSave = () => {
    const names = columns.map((c) => c.name.trim().toLowerCase());
    if (names.some((n) => !n)) return toast({ kind: "error", text: "Every column needs a name." });
    if (new Set(names).size !== names.length) return toast({ kind: "error", text: "Two columns have the same name." });
    save.mutate(
      {
        columns: columns.map(({ id, name, color, kind }) => ({ id, name: name.trim(), color, kind })),
        assignments: data.sources.map((s) => ({ sourceId: s.id, columnId: assign[s.id] === NONE ? null : (assign[s.id] ?? null) })),
      },
      {
        onSuccess: (r) => {
          toast({ kind: "success", text: "Categories saved. The board has been updated." });
          r.warnings.forEach((w) => toast({ kind: "info", text: w }));
          onClose();
        },
        onError: (e) => toast({ kind: "error", text: e.message }),
      },
    );
  };

  const active = data.sources.find((s) => s.id === activeId);
  const moveTargets = [...columns.map((c) => ({ id: c.id, name: c.name })), { id: NONE, name: "Not needed" }];

  return (
    <>
      <header className="flex items-start gap-3 border-b border-line px-6 py-4">
        <div className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
          <Layers className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-semibold">Organize calendar categories</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Drag each kind of calendar entry into the column it belongs to. Put several entries in one column to merge them (e.g. <em>Fagdag Fysik</em> into <em>Fysik 10</em>).
            Entries in <strong>Not needed</strong> stay on your calendar but never become lesson cards.
          </p>
        </div>
        {newCount > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            <Sparkles className="size-3.5" /> {newCount} new
          </span>
        )}
        <DrawerClose onClose={onClose} />
      </header>

      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto bg-app p-4">
          <div className="sticky left-0 z-10 flex shrink-0 bg-app pr-3 shadow-[8px_0_8px_-8px_rgb(0_0_0/0.12)]">
            <NotNeededColumn sources={byColumn.get(NONE) ?? []} moveTargets={moveTargets} onMove={move} />
          </div>
          {columns.map((c) => (
            <CategoryColumn
              key={c.id}
              column={c}
              sources={byColumn.get(c.id) ?? []}
              moveTargets={moveTargets}
              onMove={move}
              onChange={(patch) => setColumns((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)))}
              onRemove={() => removeColumn(c)}
            />
          ))}
          <div className="flex w-[200px] shrink-0 flex-col gap-2">
            <button onClick={() => addColumn("subject")} className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 text-[13px] text-muted hover:bg-hover hover:text-fg">
              <Plus className="size-4" /> Subject column
            </button>
            <button onClick={() => addColumn("special")} className="flex h-10 items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 text-[13px] text-muted hover:bg-hover hover:text-fg">
              <Plus className="size-4" /> Special column
            </button>
            <p className="px-1 text-[11px] leading-snug text-faint">Special columns collect prep for events that aren't tied to one subject, like <em>Fagdag</em>. Empty subject columns are removed on save.</p>
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 150, easing: "ease-out" }}>{active ? <SourceChip source={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <footer className="flex items-center gap-3 border-t border-line px-6 py-3">
        <span className="text-xs text-faint">
          {data.sources.length} calendar entries · {columns.length} columns · {(byColumn.get(NONE) ?? []).length} not needed
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doSave} loading={save.isPending}>
            Save categories
          </Button>
        </div>
      </footer>
    </>
  );
}

function CategoryColumn({
  column: c,
  sources,
  moveTargets,
  onMove,
  onChange,
  onRemove,
}: {
  column: Column;
  sources: CategorySourceDTO[];
  moveTargets: { id: string; name: string }[];
  onMove: (sourceId: string, columnId: string) => void;
  onChange: (patch: Partial<Column>) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: c.id });
  const events = sources.reduce((n, s) => n + s.eventCount, 0);
  return (
    <section
      ref={setNodeRef}
      className={cx("flex w-[224px] shrink-0 flex-col rounded-lg border bg-surface transition-colors", isOver ? "border-accent bg-accent-soft" : "border-line")}
      aria-label={`${c.name} column`}
    >
      <div className="border-b border-line p-2.5">
        <div className="flex items-center gap-2">
          <label className="relative size-3.5 shrink-0 cursor-pointer rounded-full" style={{ background: c.color }} title="Change color">
            <input type="color" value={c.color} onChange={(e) => onChange({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${c.name} color`} />
          </label>
          <input
            data-col-name={c.id}
            value={c.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-label="Column name"
            className="min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] font-semibold outline-none hover:bg-hover focus:bg-hover"
          />
          <button onClick={onRemove} className="rounded p-1 text-faint hover:bg-hover hover:text-danger" aria-label={`Remove ${c.name} column`} title="Remove column">
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 pl-5.5 text-[11px] text-faint">
          <button
            onClick={() => onChange({ kind: c.kind === "special" ? "subject" : "special" })}
            className={cx("rounded-full px-1.5 py-px font-medium", c.kind === "special" ? "bg-hover text-muted" : "bg-accent-soft text-accent")}
            title="Toggle between subject and special column"
          >
            {c.kind === "special" ? "Special" : "Subject"}
          </button>
          <span className="tabular-nums">{events} slots</span>
        </div>
      </div>
      <div className="flex min-h-[80px] flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {sources.map((s) => (
          <DraggableSource key={s.id} source={s} moveTargets={moveTargets} current={c.id} onMove={onMove} />
        ))}
        {sources.length === 0 && <div className="grid flex-1 place-items-center rounded-md border border-dashed border-line py-6 text-[11px] text-faint">Drop entries here</div>}
      </div>
    </section>
  );
}

function NotNeededColumn({ sources, moveTargets, onMove }: { sources: CategorySourceDTO[]; moveTargets: { id: string; name: string }[]; onMove: (sourceId: string, columnId: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: NONE });
  return (
    <section ref={setNodeRef} className={cx("flex w-[224px] shrink-0 flex-col rounded-lg border border-dashed transition-colors", isOver ? "border-accent bg-accent-soft" : "border-line-strong bg-surface")} aria-label="Not needed">
      <div className="border-b border-line p-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
          <Ban className="size-3.5" /> Not needed
        </div>
        <div className="mt-1 text-[11px] text-faint">Shown on the calendar only</div>
      </div>
      <div className="flex min-h-[80px] flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {sources.map((s) => (
          <DraggableSource key={s.id} source={s} moveTargets={moveTargets} current={NONE} onMove={onMove} />
        ))}
      </div>
    </section>
  );
}

function DraggableSource({ source, moveTargets, current, onMove }: { source: CategorySourceDTO; moveTargets: { id: string; name: string }[]; current: string; onMove: (sourceId: string, columnId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: source.id });
  return (
    <div ref={setNodeRef} className={cx(isDragging && "opacity-30")}>
      <SourceChip
        source={source}
        handle={{ ...attributes, ...listeners }}
        menu={
          <label className="relative grid size-6 shrink-0 place-items-center rounded text-faint hover:bg-hover hover:text-fg" title="Move to…">
            <ArrowRightLeft className="size-3.5" />
            <select
              value={current}
              onChange={(e) => onMove(source.id, e.target.value)}
              aria-label={`Move ${source.label} to column`}
              className="absolute inset-0 cursor-pointer opacity-0"
            >
              {moveTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
    </div>
  );
}

function SourceChip({ source: s, dragging, handle, menu }: { source: CategorySourceDTO; dragging?: boolean; handle?: Record<string, unknown>; menu?: React.ReactNode }) {
  return (
    <div className={cx("flex items-center gap-1.5 rounded-md border bg-raised px-1.5 py-1.5", dragging ? "rotate-1 border-line-strong shadow-float" : "border-line hover:border-line-strong")}>
      <button {...handle} className="cursor-grab touch-none text-faint active:cursor-grabbing" aria-label={`Drag ${s.label}`}>
        <GripVertical className="size-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium">{s.label}</span>
          {!s.reviewed && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">New</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-faint">
          <span>{TYPE_LABEL[s.eventType] ?? s.eventType}</span>
          <span>·</span>
          <span className="tabular-nums">
            {s.eventCount} {s.eventCount === 1 ? "time" : "times"}
          </span>
          {s.eventCount <= 3 && s.nextDate && (
            <span className="inline-flex items-center gap-0.5">
              <CalendarDays className="size-3" /> {fmtDate(s.nextDate)}
            </span>
          )}
        </div>
      </div>
      {menu}
    </div>
  );
}
