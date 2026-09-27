import { useLayoutEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, GripVertical, ListChecks, Paperclip } from "lucide-react";
import type { Lesson, Subject } from "./types";
import { cx, dayBefore, previewLines, shortDateTime, time } from "./format";
import { StatusBadge } from "./StatusBadge";
import { SubjectPill } from "./SubjectPill";
import { Markdown } from "./Markdown";

export interface LessonCardProps {
  lesson: Lesson;
  /** Required in By day mode (subject tag); ignored otherwise */
  subject?: Pick<Subject, "name" | "color">;
  mode?: "subject" | "day";
  expanded: boolean;
  onOpen: (lessonId: string) => void;
  onToggleExpand: (lessonId: string) => void;
  /** Spread onto the grip (By subject only), e.g. dnd-kit listeners/attributes */
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  isDragging?: boolean;
}

/** True when the element's content is cut off (line-clamp / ellipsis). */
function useIsClipped<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return setClipped(false);
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [ref, clipped] as const;
}

export function LessonCard({ lesson, subject, mode = "subject", expanded, onOpen, onToggleExpand, dragHandleProps, isDragging }: LessonCardProps) {
  const { slot, files } = lesson;
  const hasPlan = lesson.bodyText.trim().length > 0;
  const lines = previewLines(lesson.bodyText);
  const hasHw = !!lesson.homeworkText;
  const shownFiles = files.names.slice(0, 2);
  const extraFiles = files.total - shownFiles.length;

  const [planRef, planClipped] = useIsClipped<HTMLDivElement>([lesson.bodyText, expanded]);
  const [hwRef, hwClipped] = useIsClipped<HTMLSpanElement>([lesson.homeworkText, expanded]);
  const [fileRef, fileClipped] = useIsClipped<HTMLSpanElement>([files.names.join(), expanded]);
  // Headings are dropped from the preview, so their presence also means something is hidden.
  const hiddenHeadings = hasPlan && lines.length < lesson.bodyText.split("\n").filter((s) => s.trim()).length;
  const truncated = planClipped || hiddenHeadings || hwClipped || fileClipped || extraFiles > 0;
  const [wasTruncatable, setWasTruncatable] = useState(false);
  useLayoutEffect(() => { if (!expanded) setWasTruncatable(truncated); }, [expanded, truncated]);
  const showToggle = expanded ? wasTruncatable : truncated;
  const showFooter = lesson.openTaskCount > 0 || showToggle;

  const postLabel =
    hasHw && slot
      ? lesson.homeworkPostedAt
        ? "Posted " + dayBefore(lesson.homeworkPostedAt + "T00:00", 0).split(" ")[1]
        : "Post " + dayBefore(slot.startTime, lesson.homeworkOffset ?? 0)
      : null;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lesson.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(lesson.id))}
      className={cx(
        "group relative flex w-full cursor-pointer flex-col gap-2 rounded-card border bg-surface-raised px-3.5 py-3 text-left text-text outline-none transition-[border-color,box-shadow]",
        "focus-visible:ring-[3px] focus-visible:ring-focus-ring",
        isDragging ? "rotate-[2.5deg] border-border-strong shadow-float" : "border-border shadow-card hover:border-border-strong",
        lesson.status === "done" && "opacity-60"
      )}
    >
      {mode === "subject" && dragHandleProps && (
        <span
          {...dragHandleProps}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
          className="absolute left-0.5 top-3.5 cursor-grab text-text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <GripVertical size={12} />
        </span>
      )}

      <header className="flex min-h-5 items-center gap-2">
        {mode === "day" && subject && <SubjectPill variant="tag" name={subject.name} color={subject.color} />}
        {mode === "subject" && slot && (
          <span className="flex min-w-0 items-center gap-[5px] truncate text-[11px] text-text-muted tabular-nums">
            {shortDateTime(slot.startTime)}
            {slot.room && <><span className="text-text-faint">·</span>{slot.room}</>}
          </span>
        )}
        <span className="flex-1" />
        <StatusBadge status={lesson.status} />
      </header>
      {mode === "day" && slot && (
        <div className="-mt-1 truncate text-[11px] text-text-muted tabular-nums">
          {time(slot.startTime)}–{time(slot.endTime)}{slot.room && " · " + slot.room}
        </div>
      )}

      {lesson.title.trim() && <h3 className="text-[14px] font-semibold leading-[1.35] tracking-[-0.005em] text-pretty">{lesson.title}</h3>}

      {!hasPlan && <p className="text-[13px] italic text-text-faint">No plan yet</p>}
      {hasPlan && !expanded && (
        <div ref={planRef} className="line-clamp-3 whitespace-pre-line text-[13px] leading-[1.5] text-text-muted [overflow-wrap:anywhere]">
          {lines.join("\n")}
        </div>
      )}
      {hasPlan && expanded && <Markdown source={lesson.bodyText} />}

      {(hasHw || files.total > 0) && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2 text-[12px] leading-[1.45]">
          {hasHw && (
            <div className={cx("flex gap-[7px]", expanded ? "items-start" : "items-center")}>
              <BookOpen size={13} className="shrink-0 text-text-faint" />
              <span ref={hwRef} className={cx("min-w-0 flex-1", !expanded && "truncate")}>{lesson.homeworkText}</span>
              {postLabel && (
                <span className={cx("shrink-0 text-[11px] tabular-nums", lesson.homeworkPostedAt ? "text-success" : "text-text-faint")}>{postLabel}</span>
              )}
            </div>
          )}
          {files.total > 0 && (
            <div className="flex items-start gap-[7px]">
              <Paperclip size={13} className="mt-0.5 shrink-0 text-text-faint" />
              {expanded ? (
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {files.names.map((n) => <span key={n} className="[overflow-wrap:anywhere]">{n}</span>)}
                  {files.total > files.names.length && <span className="text-text-faint">+{files.total - files.names.length} more in folder</span>}
                </span>
              ) : (
                <span ref={fileRef} className="min-w-0 flex-1 truncate">
                  {shownFiles.join(", ")}{extraFiles > 0 && " +" + extraFiles}
                </span>
              )}
              <span className="shrink-0 text-[11px] text-text-faint tabular-nums">{files.total}</span>
            </div>
          )}
        </div>
      )}

      {showFooter && (
        <footer className="flex items-center gap-1.5 text-[11px] text-text-muted tabular-nums">
          {lesson.openTaskCount > 0 && (
            <span className="inline-flex items-center gap-[5px]">
              <ListChecks size={12} />
              {lesson.openTaskCount} open task{lesson.openTaskCount === 1 ? "" : "s"}
            </span>
          )}
          <span className="flex-1" />
          {showToggle && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleExpand(lesson.id); }}
              aria-expanded={expanded}
              className="-mr-1.5 inline-flex items-center gap-[3px] rounded-md px-1.5 py-0.5 hover:bg-surface-hover hover:text-text"
            >
              {expanded ? "Show less" : "Show more"}
              <ChevronDown size={12} className={expanded ? "rotate-180" : ""} />
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

/** Drop indicator line between cards while dragging */
export function DropIndicator() {
  return (
    <div className="relative mx-0.5 h-0.5 rounded bg-accent">
      <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-surface shadow-[inset_0_0_0_2px_var(--accent)]" />
    </div>
  );
}
