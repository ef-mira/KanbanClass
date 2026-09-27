import type { ReactNode } from "react";
import { cx } from "./format";

export interface MetricCardProps {
  name: string;
  color: string;
  completed: number;
  planned: number;
  remaining: number;
  totalSlots: number;
}

export function MetricCard({ name, color, completed, planned, remaining, totalSlots }: MetricCardProps) {
  const pct = (n: number) => (totalSlots ? (n / totalSlots) * 100 : 0) + "%";
  const Stat = ({ n, label, dim }: { n: number; label: string; dim?: boolean }): ReactNode => (
    <div className="flex flex-col gap-px">
      <span className={cx("text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]", dim && "text-text-muted")}>{n}</span>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3 rounded-panel border border-border bg-surface-raised px-4 py-3.5 tabular-nums">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
        <span className="text-[11px] text-text-faint">{totalSlots} slots</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Stat n={completed} label="Completed" />
        <Stat n={planned} label="Planned" />
        <Stat n={remaining} label="Remaining" dim />
      </div>
      <div className="flex h-[5px] overflow-hidden rounded-full bg-border">
        <div style={{ width: pct(completed), background: color }} />
        <div style={{ width: pct(planned), background: color + "70" }} />
      </div>
    </div>
  );
}
