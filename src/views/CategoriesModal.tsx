import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from "@dnd-kit/core";
import { Layers, Plus, X } from "lucide-react";
import type { CategoriesDTO, CategorySourceDTO, SubjectKind } from "../../shared/types";
import { useCategories, useSaveCategories } from "../api";
import { Button } from "../ui/Button";
import { CategoryColumn } from "../ui/CategoryColumn";
import { SourceChip } from "../ui/SourceChip";
import type { CalendarSource } from "../ui/types";
import { cx } from "../ui/format";
import { Skeleton } from "../components/ui";
import { useToast } from "../components/toast";

const NONE = "__not_needed__";
const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1", "#14b8a6", "#64748b"];

interface Column {
  id: string;
  name: string;
  color: string;
  kind: SubjectKind;
  plannedCount: number;
}

const toSource = (s: CategorySourceDTO): CalendarSource => ({
  id: s.id,
  label: s.label,
  eventType: s.eventType === "pause" ? "other" : s.eventType,
  eventCount: s.eventCount,
  reviewed: s.reviewed,
  nextDate: s.nextDate,
});

export function CategoriesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useCategories(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-6">
      <div className="animate-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Organize calendar categories"
        className="animate-modal relative flex max-h-full w-full max-w-[1392px] flex-col overflow-hidden rounded-panel bg-surface-raised text-[13px] shadow-float"
      >
        {data ? (
          <Editor data={data} onClose={onClose} />
        ) : (
          <div className="space-y-3 p-6">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-96" />
          </div>
        )}
      </div>
    </div>
  );
}

function Editor({ data, onClose }: { data: CategoriesDTO; onClose: () => void }) {
  const save = useSaveCategories();
  const toast = useToast();
  const [columns, setColumns] = useState<Column[]>(() => data.columns.map((c) => ({ ...c })));
  const [assign, setAssign] = useState<Record<string, string>>(() => Object.fromEntries(data.sources.map((s) => [s.id, s.isIgnored || !s.subjectId ? NONE : s.subjectId])));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [newSeq, setNewSeq] = useState(1);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const newCount = data.sources.filter((s) => !s.reviewed).length;

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
    for (const list of m.values()) list.sort((a, b) => Number(b.eventType === "lesson") - Number(a.eventType === "lesson") || b.eventCount - a.eventCount);
    return m;
  }, [data.sources, assign]);

  const slotsIn = (columnId: string) => (byColumn.get(columnId) ?? []).reduce((n, s) => n + s.eventCount, 0);
  const move = (sourceId: string, columnId: string) => setAssign((a) => ({ ...a, [sourceId]: columnId }));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    if (e.over) move(String(e.active.id), String(e.over.id));
  };

  const addColumn = (kind: SubjectKind) => {
    const id = `new:${newSeq}`;
    setNewSeq((n) => n + 1);
    const base = kind === "special" ? "Special" : "New subject";
    let name = base;
    for (let n = 2; columns.some((c) => c.name.toLowerCase() === name.toLowerCase()); n++) name = `${base} ${n}`;
    setColumns((cs) => [...cs, { id, name, color: kind === "special" ? "#64748b" : PALETTE[cs.length % PALETTE.length], kind, plannedCount: 0 }]);
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-col="${id}"] input[aria-label="Column name"]`)?.select());
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
  const notNeeded = byColumn.get(NONE) ?? [];

  return (
    <>
      <header className="flex items-start gap-3 border-b border-border px-6 py-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
          <Layers size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-[650]">Organize calendar categories</h2>
            {newCount > 0 && <span className="inline-flex h-5 items-center rounded-full bg-accent px-2 text-[11px] font-semibold text-accent-fg">{newCount} new</span>}
          </div>
          <p className="mt-1 text-[13px] text-text-muted">Drag each kind of calendar entry into the column it belongs to. Entries in the same column become one lesson sequence.</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid size-[30px] shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text">
          <X size={16} />
        </button>
      </header>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={(e: DragOverEvent) => setOverId(e.over ? String(e.over.id) : null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => (setActiveId(null), setOverId(null))}
      >
        <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto bg-bg p-5">
          <Droppable id={NONE} isOver={overId === NONE}>
            {(isOver) => (
              <CategoryColumn kind="not-needed" entryCount={notNeeded.length} isDropTarget={isOver}>
                {notNeeded.map((s) => (
                  <DraggableChip key={s.id} source={s} muted current={NONE} moveTargets={moveTargets} onMove={move} />
                ))}
              </CategoryColumn>
            )}
          </Droppable>

          {columns.map((c) => (
            <Droppable key={c.id} id={c.id} isOver={overId === c.id}>
              {(isOver) => (
                <div data-col={c.id} className="flex">
                  <CategoryColumn
                    kind={c.kind}
                    name={c.name}
                    color={c.color}
                    slotCount={slotsIn(c.id)}
                    entryCount={(byColumn.get(c.id) ?? []).length}
                    isDropTarget={isOver}
                    onRename={(name) => setColumns((cs) => cs.map((x) => (x.id === c.id ? { ...x, name } : x)))}
                    onKindChange={(kind) => setColumns((cs) => cs.map((x) => (x.id === c.id ? { ...x, kind } : x)))}
                    onRemove={() => removeColumn(c)}
                  >
                    {(byColumn.get(c.id) ?? []).map((s) => (
                      <DraggableChip key={s.id} source={s} current={c.id} moveTargets={moveTargets} onMove={move} />
                    ))}
                    {isOver && activeId && assign[activeId] !== c.id && (
                      <div className="grid h-[52px] place-items-center rounded-card border-[1.5px] border-dashed border-accent text-[12px] font-medium text-accent">Drop to merge into {c.name}</div>
                    )}
                    <ColorInput value={c.color} onChange={(color) => setColumns((cs) => cs.map((x) => (x.id === c.id ? { ...x, color } : x)))} />
                  </CategoryColumn>
                </div>
              )}
            </Droppable>
          ))}

          <div className="flex w-[150px] shrink-0 flex-col gap-2">
            <button onClick={() => addColumn("subject")} className="flex h-[38px] items-center gap-1.5 rounded-[9px] border border-dashed border-border-strong px-3 text-text-muted hover:bg-surface hover:text-text">
              <Plus size={14} /> Subject column
            </button>
            <button onClick={() => addColumn("special")} className="flex h-[38px] items-center gap-1.5 rounded-[9px] border border-dashed border-border-strong px-3 text-text-muted hover:bg-surface hover:text-text">
              <Plus size={14} /> Special column
            </button>
            <p className="px-1 text-[11px] leading-[1.45] text-text-faint">
              Subject columns follow one class. Special columns collect prep that isn't tied to one subject, like Fagdag.
            </p>
          </div>
        </div>

        <DragOverlay>{active ? <SourceChip source={toSource(active)} isDragging onMoveMenu={() => {}} /> : null}</DragOverlay>
      </DndContext>

      <footer className="flex items-center gap-3 border-t border-border py-3 pr-5 pl-6">
        <span className="text-[12px] text-text-muted tabular-nums">
          {data.sources.length} calendar entries · {columns.length} columns · {notNeeded.length} not needed
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doSave} disabled={save.isPending}>
            Save categories
          </Button>
        </div>
      </footer>
    </>
  );
}

/** Wraps a column so it can receive chips. */
function Droppable({ id, isOver, children }: { id: string; isOver: boolean; children: (isOver: boolean) => React.ReactNode }) {
  const { setNodeRef, isOver: over } = useDroppable({ id });
  return <div ref={setNodeRef} className="flex">{children(isOver || over)}</div>;
}

function DraggableChip({
  source,
  muted,
  current,
  moveTargets,
  onMove,
}: {
  source: CategorySourceDTO;
  muted?: boolean;
  current: string;
  moveTargets: { id: string; name: string }[];
  onMove: (sourceId: string, columnId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: source.id });
  return (
    <div ref={setNodeRef} className={cx("relative", isDragging && "opacity-30")}>
      <SourceChip
        source={toSource(source)}
        muted={muted}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLElement>}
        onMoveMenu={() => {}}
      />
      {/* Keyboard path: a native select layered over the move-to button. */}
      <select
        value={current}
        onChange={(e) => onMove(source.id, e.target.value)}
        aria-label={`Move ${source.label} to column`}
        className="absolute top-1/2 right-1 size-[22px] -translate-y-1/2 cursor-pointer opacity-0"
      >
        {moveTargets.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The colour dot in the column header opens this hidden input. */
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Column colour"
      className="absolute top-3 left-2.5 size-3 cursor-pointer opacity-0"
    />
  );
}
