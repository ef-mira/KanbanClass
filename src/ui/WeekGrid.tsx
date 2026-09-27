import type { CalendarEvent } from "./types";
import { cx } from "./format";

export interface WeekGridProps {
  /** Monday of the week, ISO date */
  weekStart: string;
  events: CalendarEvent[];
  /** Current time (ISO) for the now-line; omit to hide */
  now?: string;
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  onEventClick?: (id: string) => void;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const mins = (iso: string) => { const t = iso.split("T")[1]; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hatch = "repeating-linear-gradient(135deg, var(--surface-hover) 0 4px, transparent 4px 8px)";

export function WeekGrid({ weekStart, events, now, startHour = 8, endHour = 16, hourHeight = 62, onEventClick }: WeekGridProps) {
  const start = new Date(weekStart + "T00:00");
  const days = DOW.map((d, i) => {
    const dt = new Date(start); dt.setDate(start.getDate() + i);
    const iso = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    return { label: d + " " + dt.getDate(), iso };
  });
  const top = (m: number) => ((m - startHour * 60) / 60) * hourHeight;
  const nowDay = now?.split("T")[0];
  const hours = Array.from({ length: endHour - startHour - 1 }, (_, i) => startHour + i + 1);

  return (
    <div className="flex min-h-0 flex-col text-[12px]">
      <div className="grid grid-cols-[44px_repeat(5,minmax(0,1fr))] border-t border-border">
        <span />
        {days.map((d) => (
          <div key={d.iso} className={cx("border-l border-border px-2.5 py-2 tabular-nums", d.iso === nowDay ? "font-semibold text-accent" : "font-medium text-text-muted")}>{d.label}</div>
        ))}
      </div>
      <div className="relative grid grid-cols-[44px_repeat(5,minmax(0,1fr))] border-t border-border" style={{ height: (endHour - startHour) * hourHeight }}>
        <div className="relative">
          {hours.map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-text-faint tabular-nums" style={{ top: (h - startHour) * hourHeight }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.iso}
            className={cx("relative border-l border-border", d.iso === nowDay && "bg-accent-soft")}
            style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px)", backgroundSize: "100% " + hourHeight + "px" }}
          >
            {events.filter((e) => e.start.startsWith(d.iso)).map((e) => {
              const y = top(mins(e.start)), h = top(mins(e.end)) - y;
              const faint = e.kind === "pause" || e.ignored;
              const past = now ? e.end < now : false;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onEventClick?.(e.id)}
                  className="absolute inset-x-[3px] flex flex-col gap-px overflow-hidden rounded-md px-[7px] py-1 text-left"
                  style={{
                    top: y, height: h - 2,
                    background: e.subjectColor && !faint ? e.subjectColor + "22" : faint ? hatch : "var(--surface-hover)",
                    boxShadow: e.subjectColor && !faint ? "inset 0 0 0 1px " + e.subjectColor + "40" : faint ? "inset 0 0 0 1px var(--border)" : "none",
                    opacity: past ? 0.55 : 1,
                  }}
                >
                  <span className={cx("truncate text-[11.5px]", faint ? "text-text-faint" : "font-semibold text-text")}>{e.title}</span>
                  {h >= 36 && <span className="truncate text-[10.5px] text-text-muted tabular-nums">{e.start.slice(11, 16)}{e.room && " · " + e.room}</span>}
                </button>
              );
            })}
            {now && d.iso === nowDay && (
              <div className="absolute -left-1 right-0 z-10 h-0.5 bg-danger" style={{ top: top(mins(now)) }}>
                <span className="absolute -top-[3px] left-0 size-2 rounded-full bg-danger" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
