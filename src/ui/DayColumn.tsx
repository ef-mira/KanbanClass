import type { ReactNode } from "react";
import { cx } from "./format";

export interface DayColumnProps {
  /** "Monday" */
  weekday: string;
  /** "Mon", shown when the column is too narrow for the full name */
  weekdayShort: string;
  /** "21 Sept" */
  date: string;
  isToday: boolean;
  count: number;
  /** LessonCards in time order, mode="day" */
  children: ReactNode;
}

/** Flexible-width column; a 7-day week fits beside the sidebar at 1440 wide. Extra columns scroll sideways. */
export function DayColumn({ weekday, weekdayShort, date, isToday, count, children }: DayColumnProps) {
  return (
    <section aria-label={weekday + " " + date} className="@container flex min-w-[150px] flex-1 flex-col overflow-hidden rounded-panel bg-surface">
      <header className="flex items-center gap-1.5 px-3.5 pb-2.5 pt-3 tabular-nums">
        <span className={cx("text-[13px] font-semibold whitespace-nowrap", isToday ? "text-accent" : "text-text")}>
          <span className="hidden @[215px]:inline">{weekday}</span>
          <span className="@[215px]:hidden">{weekdayShort}</span>
        </span>
        <span className="text-[12px] whitespace-nowrap text-text-muted">{date}</span>
        {isToday && <span className="flex h-[18px] items-center rounded-full bg-accent px-[7px] text-[10.5px] font-semibold text-accent-fg">Today</span>}
        <span className="flex-1" />
        <span className="text-[12px] text-text-faint">{count}</span>
      </header>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-3">{children}</div>
    </section>
  );
}
