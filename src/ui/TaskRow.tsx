import { Check, Sparkles } from "lucide-react";
import type { Task } from "./types";
import { cx } from "./format";

export interface TaskRowProps {
  task: Task;
  onToggle: (id: string) => void;
  onOpenLesson: (lessonId: string) => void;
}

export function TaskRow({ task, onToggle, onOpenLesson }: TaskRowProps) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-3 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        onClick={() => onToggle(task.id)}
        className={cx("grid size-3.5 shrink-0 place-items-center rounded", task.done ? "bg-accent text-white" : "border-[1.5px] border-border-strong hover:border-text-muted")}
      >
        {task.done && <Check size={10} strokeWidth={3.5} />}
      </button>
      <span className={cx("min-w-0 flex-1 truncate", task.done && "text-text-faint line-through")}>{task.title}</span>
      {task.autoExtracted && (
        <span title="Found in the lesson plan" className="text-accent"><Sparkles size={12} /></span>
      )}
      {task.due && <span className="text-[11px] text-text-muted tabular-nums">{task.due}</span>}
      <button type="button" onClick={() => onOpenLesson(task.lessonId)} className="whitespace-nowrap text-[11px] font-medium text-accent hover:underline">
        {task.lessonTitle}
      </button>
    </div>
  );
}
