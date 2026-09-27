import type { ReactNode } from "react";
import { cx } from "./format";

export interface DayColumnProps {
  /** "Monday" */
  weekday: string;
  /** "21 Sept" */
  date: string;
  isToday: boolean;
  count: number;
  /** LessonCards in time order, mode="day" */
  children: ReactNode;
}

/** Flexible-width column; five fit across at 1280. Sat/Sun columns are only rendered when something is scheduled. */
export function DayColumn({ weekday, date, isToday, count, children }: DayColumnProps) {
  return (
    <section aria-label={weekday + " " + date} className="flex min-w-[220px] flex-1 flex-col overflow-hidden rounded-panel bg-surface">
      <header className="flex items-center gap-1.5 px-3.5 pb-2.5 pt-3 tabular-nums">
        <span className={cx("text-[13px] font-semibold", isToday ? "text-accent" : "text-text")}>{weekday}</span>
        <span className="text-[12px] text-text-muted">{date}</span>
        {isToday && <span className="flex h-[18px] items-center rounded-full bg-accent px-[7px] text-[10.5px] font-semibold text-accent-fg">Today</span>}
        <span className="flex-1" />
        <span className="text-[12px] text-text-faint">{count}</span>
      </header>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-3">{children}</div>
    </section>
  );
}
