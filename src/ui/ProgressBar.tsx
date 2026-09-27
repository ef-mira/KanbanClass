import { tint } from "./format";

export interface ProgressBarProps {
  color: string;
  completed: number;
  planned: number;
  total: number;
  height?: number;
  /** Show "22 done · 4 planned · 129 left" under the bar */
  showCounts?: boolean;
  remaining?: number;
}

/** Stacked bar: completed (solid subject colour) · planned (44% tint) · remaining (track). */
export function ProgressBar({ color, completed, planned, total, height = 4, showCounts, remaining }: ProgressBarProps) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0) + "%";
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex overflow-hidden rounded-full bg-border"
        style={{ height }}
        role="img"
        aria-label={completed + " completed, " + planned + " planned of " + total}
      >
        <div style={{ width: pct(completed), background: color }} />
        <div style={{ width: pct(planned), background: tint(color, 0.44) }} />
      </div>
      {showCounts && (
        <div className="flex gap-3 text-[11px] text-text-muted tabular-nums">
          <span><b className="font-semibold text-text">{completed}</b> done</span>
          <span><b className="font-semibold text-text">{planned}</b> planned</span>
          <span className="ml-auto"><b className="font-semibold text-text">{remaining ?? total - completed - planned}</b> left</span>
        </div>
      )}
    </div>
  );
}
