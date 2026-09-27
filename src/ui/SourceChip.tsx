import { ArrowRightLeft, GripVertical } from "lucide-react";
import type { CalendarSource } from "./types";
import { cx } from "./format";

const TYPE_LABEL: Record<CalendarSource["eventType"], string> = {
  lesson: "Lesson",
  meeting: "Meeting",
  supervision: "Supervision",
  other: "Event",
};
const fmtNext = (iso: string) => {
  // Accepts a date ("2026-10-14") or a full timestamp from the API.
  const d = new Date(iso.length === 10 ? iso + "T00:00" : iso);
  return d.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"][d.getMonth()];
};

export interface SourceChipProps {
  source: CalendarSource;
  /** Chips in "Not needed" are rendered muted */
  muted?: boolean;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  /** Opens a "Move to…" menu — the keyboard path for the drag interaction */
  onMoveMenu: (sourceId: string, anchor: HTMLElement) => void;
}

export function SourceChip({ source, muted, isDragging, dragHandleProps, onMoveMenu }: SourceChipProps) {
  const meta = [
    TYPE_LABEL[source.eventType],
    source.eventCount + (source.eventCount === 1 ? " time" : " times"),
    source.nextDate && fmtNext(source.nextDate),
  ].filter(Boolean).join(" · ");
  return (
    <div
      className={cx(
        "group flex items-start gap-1.5 rounded-card border py-2 pl-1 pr-1.5",
        muted ? "border-border bg-surface" : "border-border bg-surface-raised shadow-card",
        isDragging ? "-rotate-3 border-border-strong shadow-float" : "hover:border-border-strong"
      )}
    >
      <span {...dragHandleProps} aria-label={"Drag " + source.label} className="cursor-grab pt-0.5 text-text-faint">
        <GripVertical size={12} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cx("truncate font-medium", muted && "text-text-muted")}>{source.label}</span>
          {!source.reviewed && (
            <span className="flex h-4 shrink-0 items-center rounded bg-accent-soft px-[5px] text-[10px] font-semibold text-accent">New</span>
          )}
        </div>
        <div className={cx("text-[11px] leading-[1.4] tabular-nums", muted ? "text-text-faint" : "text-text-muted")}>{meta}</div>
      </div>
      <button
        type="button"
        aria-label={"Move " + source.label + " to…"}
        onClick={(e) => onMoveMenu(source.id, e.currentTarget)}
        className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-text-faint opacity-0 hover:bg-surface-hover hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
      >
        <ArrowRightLeft size={13} />
      </button>
    </div>
  );
}
