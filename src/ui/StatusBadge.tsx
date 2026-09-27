import { AlertTriangle, Check } from "lucide-react";
import type { LessonStatus } from "./types";
import { cx } from "./format";

const base = "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium whitespace-nowrap";

export const statusLabel: Record<LessonStatus, string> = {
  done: "Done",
  planned: "Planned",
  "needs-plan": "Needs plan",
  unplanned: "Unplanned",
  "no-slot": "Unscheduled",
};

export function StatusBadge({ status }: { status: LessonStatus }) {
  switch (status) {
    case "done":
      return <span className={cx(base, "bg-success-soft text-success")}><Check size={11} strokeWidth={2.6} />Done</span>;
    case "planned":
      return (
        <span className={cx(base, "border border-accent text-accent")}>
          <span className="size-1.5 rounded-full border-[1.5px] border-current" />Planned
        </span>
      );
    case "needs-plan":
      return <span className={cx(base, "bg-warning-soft font-semibold text-warning")}><AlertTriangle size={12} strokeWidth={2.4} />Needs plan</span>;
    case "unplanned":
      return <span className={cx(base, "border border-dashed border-border-strong text-text-faint")}>Unplanned</span>;
    case "no-slot":
      return <span className={cx(base, "bg-surface-hover text-text-muted")}>Unscheduled</span>;
  }
}
