import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EVENT_TYPES, type CalendarEventDTO, type EventType } from "../../shared/types";
import { useEvents, useSettings, useUpdateSettings } from "../api";
import { useNav } from "../nav";
import { addDays, fmtTime, isoDate, isoWeek, startOfWeek, subjectTint } from "../lib/format";
import { useIsDark } from "../lib/theme";
import { Button, cx, IconButton, ToggleChip } from "../components/ui";

const TYPE_LABEL: Record<EventType, string> = { lesson: "Lessons", pause: "Pauses", meeting: "Meetings", supervision: "Supervision", other: "Other" };
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 16;
const HOUR_PX = 56;

export function WeekGrid() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 7);
  const { data } = useEvents(weekStart, weekEnd);
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { openLesson, openDay } = useNav();
  const dark = useIsDark();
  const hidden = new Set<EventType>(settings?.hiddenEventTypes ?? ["pause"]);
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const toggleType = (t: EventType) => {
    const next = new Set(hidden);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    updateSettings.mutate({ hiddenEventTypes: [...next] });
  };

  const visible = (data?.events ?? []).filter((e) => !hidden.has(e.eventType));
  // Stretch the grid to fit early/late events.
  const [startHour, endHour] = useMemo(() => {
    let s = DEFAULT_START_HOUR;
    let e = DEFAULT_END_HOUR;
    for (const ev of visible) {
      const a = new Date(ev.startTime);
      const b = new Date(ev.endTime);
      s = Math.min(s, a.getHours());
      e = Math.max(e, b.getHours() + (b.getMinutes() ? 1 : 0));
    }
    return [s, e];
  }, [visible]);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const todayIso = isoDate(new Date());
  const now = new Date();
  const nowOffset = (now.getHours() + now.getMinutes() / 60 - startHour) * HOUR_PX;

  return (
    <section className="rounded-[10px] border border-line bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
        <h2 className="text-[13px] font-semibold">Week {isoWeek(weekStart)}</h2>
        <span className="text-xs text-faint">
          {weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {addDays(weekStart, 4).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </Button>
          <IconButton label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
      </header>
      <div className="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
        {EVENT_TYPES.map((t) => (
          <ToggleChip key={t} pressed={!hidden.has(t)} onClick={() => toggleType(t)} count={data?.counts[t] ?? 0}>
            {TYPE_LABEL[t]}
          </ToggleChip>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `44px repeat(5, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => {
            const iso = isoDate(d);
            return (
              <button
                key={iso}
                onClick={() => openDay(iso)}
                className={cx("border-b border-l border-line px-2 py-1.5 text-left text-xs hover:bg-hover", iso === todayIso ? "font-semibold text-accent" : "text-muted")}
                title="Open day"
              >
                {d.toLocaleDateString("en-GB", { weekday: "short" })} <span className="tabular-nums">{d.getDate()}</span>
              </button>
            );
          })}

          <div className="relative" style={{ height: hours.length * HOUR_PX }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 font-mono text-[10px] text-faint" style={{ top: i * HOUR_PX }}>
                {i > 0 && `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const iso = isoDate(d);
            const dayEvents = (data?.events ?? []).filter((e) => isoDate(new Date(e.startTime)) === iso);
            return (
              <div
                key={iso}
                className="relative cursor-pointer border-l border-line"
                style={{
                  height: hours.length * HOUR_PX,
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX}px)`,
                }}
                onClick={(e) => e.target === e.currentTarget && openDay(iso)}
              >
                {dayEvents.map((ev) => (
                  <EventBlock key={ev.id} ev={ev} startHour={startHour} dark={dark} hidden={hidden.has(ev.eventType)} onOpen={() => (ev.lessonId ? openLesson(ev.lessonId) : openDay(iso))} />
                ))}
                {iso === todayIso && nowOffset > 0 && nowOffset < hours.length * HOUR_PX && (
                  <div className="pointer-events-none absolute right-0 left-0 z-10 h-px bg-danger" style={{ top: nowOffset }}>
                    <div className="absolute -top-1 -left-1 size-2 rounded-full bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EventBlock({ ev, startHour, dark, hidden, onOpen }: { ev: CalendarEventDTO; startHour: number; dark: boolean; hidden: boolean; onOpen: () => void }) {
  if (hidden) return null;
  const a = new Date(ev.startTime);
  const b = new Date(ev.endTime);
  const top = (a.getHours() + a.getMinutes() / 60 - startHour) * HOUR_PX;
  const height = Math.max(16, ((b.getTime() - a.getTime()) / 3_600_000) * HOUR_PX - 2);
  const faded = ev.isIgnored || ev.eventType === "pause";
  const tint = ev.subjectColor ? subjectTint(ev.subjectColor, dark) : null;
  const short = height < 34;
  return (
    <button
      onClick={onOpen}
      className={cx(
        "absolute right-1 left-1 overflow-hidden rounded-md border px-1.5 text-left text-[11px] leading-tight transition-colors",
        faded ? "hatched border-line text-faint" : tint ? "border-transparent" : "border-line bg-hover text-muted",
        b.getTime() < Date.now() && "opacity-60",
        ev.isIgnored && "line-through",
        short ? "flex items-center gap-1 py-0" : "py-1",
      )}
      style={{ top, height, ...(tint && !faded && { background: tint.bg, color: tint.fg, borderLeft: `3px solid ${tint.solid}` }) }}
      title={`${ev.summary}${ev.room ? ` · ${ev.room}` : ""}${ev.isIgnored ? " (ignored)" : ""}`}
    >
      <span className="truncate font-medium">{ev.subjectName ?? ev.summary}</span>
      <span className={cx("font-mono opacity-80", short ? "shrink-0" : "block")}>
        {fmtTime(ev.startTime)}
        {!short && ev.room && ` · ${ev.room}`}
      </span>
    </button>
  );
}
