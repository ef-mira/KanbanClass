import type { ReactNode } from "react";
import { Ban, GitMerge, Trash2 } from "lucide-react";
import { cx, tint } from "./format";

export interface CategoryColumnProps {
  kind: "subject" | "special" | "not-needed";
  name?: string;
  color?: string;
  slotCount?: number;
  entryCount: number;
  /** Highlight while a chip is dragged over */
  isDropTarget?: boolean;
  onRename?: (name: string) => void;
  onColorClick?: () => void;
  onKindChange?: (k: "subject" | "special") => void;
  onRemove?: () => void;
  /** SourceChips */
  children: ReactNode;
}

export function CategoryColumn(p: CategoryColumnProps) {
  if (p.kind === "not-needed") {
    return (
      <section className={cx("flex w-[200px] shrink-0 flex-col gap-2 rounded-panel border-[1.5px] border-dashed p-2.5", p.isDropTarget ? "border-text-muted bg-surface" : "border-border-strong")}>
        <div className="flex flex-col gap-[3px] px-1 pb-1.5 pt-0.5">
          <div className="flex items-center gap-[7px] font-semibold text-text-muted">
            <Ban size={14} />Not needed<span className="text-[12px] font-normal text-text-faint">{p.entryCount}</span>
          </div>
          <p className="text-[11px] leading-[1.4] text-text-faint">Stays on the calendar. Never becomes a lesson card.</p>
        </div>
        {p.children}
      </section>
    );
  }
  const segment = (k: "subject" | "special", label: string) => (
    <button
      type="button"
      aria-pressed={p.kind === k}
      onClick={() => p.onKindChange?.(k)}
      className={cx("rounded px-1.5 py-px", p.kind === k ? "bg-surface-raised text-text shadow-[0_1px_2px_rgba(0,0,0,.1)]" : "text-text-faint hover:text-text")}
    >
      {label}
    </button>
  );
  return (
    <section
      className={cx(
        "relative flex w-[188px] shrink-0 flex-col gap-2 rounded-panel p-2.5 transition-colors",
        p.isDropTarget ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface"
      )}
    >
      <div className="flex flex-col gap-[7px] pb-1.5 pl-1 pr-0.5 pt-0.5">
        <div className="flex h-6 items-center gap-2">
          <button
            type="button"
            aria-label="Change colour"
            onClick={p.onColorClick}
            className="size-3 shrink-0 rounded-full"
            style={{ background: p.color, boxShadow: "0 0 0 3px " + tint(p.color ?? "#888", 0.19) }}
          />
          <input
            defaultValue={p.name}
            onBlur={(e) => p.onRename?.(e.currentTarget.value)}
            aria-label="Column name"
            className="-ml-[5px] min-w-0 flex-1 truncate rounded-[5px] bg-transparent px-[5px] py-0.5 font-semibold outline-none focus:bg-surface-raised focus:shadow-[0_0_0_1px_var(--accent),0_0_0_4px_var(--focus-ring)]"
          />
          <button type="button" aria-label="Remove column" onClick={p.onRemove} className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-text-faint hover:bg-surface-hover hover:text-danger">
            <Trash2 size={13} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex rounded-md bg-surface-hover p-0.5 text-[10.5px] font-medium">
            {segment("subject", "Subject")}
            {segment("special", "Special")}
          </span>
          <span className="ml-auto text-[11px] text-text-muted tabular-nums">{p.slotCount} slots</span>
        </div>
      </div>
      {p.children}
      {p.entryCount > 1 && (
        <div className="flex items-center gap-1.5 px-1 text-[11px] text-text-muted">
          <GitMerge size={12} />{p.entryCount} entries merged into one sequence
        </div>
      )}
      {p.isDropTarget && (
        <div className="flex h-[52px] items-center justify-center rounded-card border-[1.5px] border-dashed border-accent bg-surface-raised text-[12px] font-medium text-accent">
          Drop to merge into {p.name}
        </div>
      )}
    </section>
  );
}
