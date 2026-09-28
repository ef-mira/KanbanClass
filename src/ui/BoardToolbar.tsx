import { CalendarDays, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Columns3, Layers } from "lucide-react";
import type { BoardView, StatusFilter } from "./types";
import { ToggleChip } from "./ToggleChip";
import { cx } from "./format";

export interface BoardToolbarProps {
  view: BoardView;
  onViewChange: (v: BoardView) => void;
  filters: StatusFilter[];
  onToggleFilter: (f: StatusFilter) => void;
  next14: boolean;
  onToggleNext14: () => void;
  /** By week only */
  weekNumber?: number;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onToday?: () => void;
  expandState: "collapsed" | "expanded" | "mixed";
  onCollapseAll: () => void;
  onExpandAll: () => void;
  newCategoryCount: number;
  onOpenCategories: () => void;
}

const FILTERS: { id: StatusFilter; label: string; dot: string }[] = [
  { id: "needs-plan", label: "Needs plan", dot: "bg-warning" },
  { id: "unplanned", label: "Unplanned", dot: "border border-dashed border-text-faint" },
  { id: "planned", label: "Planned", dot: "border-[1.5px] border-accent" },
  { id: "no-slot", label: "Unscheduled", dot: "bg-text-faint" },
];

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "flex h-[26px] items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium whitespace-nowrap",
        active ? "bg-surface-raised text-text shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_var(--border)]" : "text-text-muted hover:text-text"
      )}
    >
      {children}
    </button>
  );
}

const iconBtn = "grid size-[26px] place-items-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text";

export function BoardToolbar(p: BoardToolbarProps) {
  return (
    <div role="toolbar" className="flex items-center gap-2 whitespace-nowrap px-5 py-2.5">
      <div className="flex rounded-lg bg-surface p-0.5 shadow-[inset_0_0_0_1px_var(--border)]">
        <Seg active={p.view === "subject"} onClick={() => p.onViewChange("subject")}><Columns3 size={13} />By subject</Seg>
        <Seg active={p.view === "day"} onClick={() => p.onViewChange("day")}><CalendarDays size={13} />By week</Seg>
      </div>

      {p.view === "day" && (
        <div className="ml-1 flex items-center gap-0.5">
          <button type="button" aria-label="Previous week" className={iconBtn} onClick={p.onPrevWeek}><ChevronLeft size={14} /></button>
          <button type="button" className="flex h-[26px] items-center rounded-md px-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-hover" onClick={p.onToday}>Today</button>
          <button type="button" aria-label="Next week" className={iconBtn} onClick={p.onNextWeek}><ChevronRight size={14} /></button>
          <span className="pl-1.5 text-[12px] font-semibold tabular-nums">Week {p.weekNumber}</span>
        </div>
      )}

      <span className="mx-1.5 h-[18px] w-px bg-border" />

      <div className="flex items-center gap-1.5">
        {FILTERS.map((f) => (
          <ToggleChip
            key={f.id}
            label={f.label}
            active={p.filters.includes(f.id)}
            onToggle={() => p.onToggleFilter(f.id)}
            leading={<span className={cx("size-1.5 rounded-full", f.dot)} />}
          />
        ))}
        {p.view === "subject" && <ToggleChip label="Next 14 days" active={p.next14} onToggle={p.onToggleNext14} />}
      </div>

      <span className="flex-1" />

      <div className="flex rounded-lg p-0.5 shadow-[inset_0_0_0_1px_var(--border)]">
        <button type="button" onClick={p.onCollapseAll} className={cx("flex h-[26px] items-center gap-[5px] rounded-md px-[9px] text-[12px]", p.expandState === "collapsed" ? "bg-surface-hover text-text" : "text-text-muted hover:text-text")}>
          <ChevronsDownUp size={13} />Collapse all
        </button>
        <button type="button" onClick={p.onExpandAll} className={cx("flex h-[26px] items-center gap-[5px] rounded-md px-[9px] text-[12px]", p.expandState === "expanded" ? "bg-surface-hover text-text" : "text-text-muted hover:text-text")}>
          <ChevronsUpDown size={13} />Expand all
        </button>
      </div>
      <button type="button" onClick={p.onOpenCategories} className="flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-hover">
        <Layers size={14} />Categories
        {p.newCategoryCount > 0 && (
          <span className="flex h-[17px] items-center rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-accent-fg tabular-nums">{p.newCategoryCount} new</span>
        )}
      </button>
    </div>
  );
}
