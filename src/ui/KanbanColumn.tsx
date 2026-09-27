import type { ReactNode } from "react";
import { ChevronRight, EyeOff, GripVertical } from "lucide-react";
import type { Subject } from "./types";
import { SubjectPill } from "./SubjectPill";
import { ProgressBar } from "./ProgressBar";
import { cx } from "./format";

export interface KanbanColumnProps {
  subject: Subject;
  /** Visible (non-completed) card count */
  cardCount: number;
  completedOpen: boolean;
  onToggleCompleted: () => void;
  onHide: () => void;
  /** Spread onto the header grip, e.g. dnd-kit sortable listeners */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
  /** Rendered completed cards (shown when completedOpen) */
  completed?: ReactNode;
  /** Rendered LessonCards (+ DropIndicator) */
  children: ReactNode;
}

export function KanbanColumn({ subject, cardCount, completedOpen, onToggleCompleted, onHide, dragHandleProps, isDragging, completed, children }: KanbanColumnProps) {
  const { stats } = subject;
  return (
    <section
      aria-label={subject.name}
      className={cx("flex max-h-full w-[320px] shrink-0 flex-col overflow-hidden rounded-panel bg-surface", isDragging && "shadow-float ring-1 ring-border-strong")}
    >
      <div className="group flex flex-col gap-2.5 pb-2.5 pl-3.5 pr-3 pt-3">
        <div className="relative flex h-6 items-center gap-1.5">
          {dragHandleProps && (
            <span {...dragHandleProps} aria-label="Drag to reorder column" className="absolute -left-3 cursor-grab text-text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
              <GripVertical size={12} />
            </span>
          )}
          <SubjectPill name={subject.name} color={subject.color} />
          <span className="text-[12px] text-text-faint tabular-nums">{cardCount}</span>
          {subject.kind === "special" && (
            <span className="flex h-[18px] items-center rounded-[5px] px-1.5 text-[10.5px] text-text-muted shadow-[inset_0_0_0_1px_var(--border-strong)]">Special</span>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onHide} aria-label={"Hide " + subject.name} className="grid size-6 place-items-center rounded-md text-text-faint hover:bg-surface-hover hover:text-text">
            <EyeOff size={14} />
          </button>
        </div>
        <ProgressBar color={subject.color} completed={stats.completed} planned={stats.planned} total={stats.totalSlots} remaining={stats.remainingSlots} showCounts />
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-3">
        {stats.completed > 0 && (
          <button
            type="button"
            onClick={onToggleCompleted}
            aria-expanded={completedOpen}
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-text-muted hover:bg-surface-hover hover:text-text"
          >
            <ChevronRight size={13} className={completedOpen ? "rotate-90" : ""} />
            {completedOpen ? "Hide" : "Show"} {stats.completed} completed lessons
          </button>
        )}
        {completedOpen && completed}
        {children}
      </div>
    </section>
  );
}
