import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "./format";

export interface ToggleChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  /** Small leading glyph, e.g. a status dot */
  leading?: ReactNode;
  count?: number;
}

/** Filter pill. Inactive: hairline outline. Active: accent-soft fill with a clear (×) affordance. */
export function ToggleChip({ label, active, onToggle, leading, count }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cx(
        "inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-[12px] whitespace-nowrap outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-focus-ring",
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-text-muted shadow-[inset_0_0_0_1px_var(--border)] hover:bg-surface-hover hover:text-text"
      )}
    >
      {leading}
      {label}
      {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
      {active && <X size={11} strokeWidth={2.4} />}
    </button>
  );
}
