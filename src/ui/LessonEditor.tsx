import { useRef, useState, type ReactNode } from "react";
import {
  Bold, Calendar, Check, ChevronDown, ChevronUp, Copy, File, FolderOpen, Heading, Italic, Link2, List,
  MapPin, Plus, Send, Sparkles, SquareCheck, Trash2, Upload, Users, X,
} from "lucide-react";
import type { Lesson, Subject } from "./types";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { SubjectPill } from "./SubjectPill";
import { cx, dayBefore, longDate, time } from "./format";

export type FormatCommand = "heading" | "bold" | "italic" | "list" | "checklist" | "link";

export interface LessonFile { name: string; size: string; modified: string }

export interface LessonEditorProps {
  lesson: Lesson;
  subject: Pick<Subject, "name" | "color">;
  /** "Lesson 27 of 155" */
  sequenceLabel?: string;
  savedAt: string | null; // "10:42"
  /** Draft values held by the app while autosaving. */
  title: string;
  homeworkText: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onTitleChange: (title: string) => void;
  /** Flush the pending autosave (called on blur). */
  onBlurSave?: () => void;

  /**
   * The live Markdown editor (CodeMirror 6 / similar). Style it with:
   *  .md-h2 { font-size:18px; font-weight:650 } · .md-mark { color: var(--text-faint) } (the ## and ** glyphs)
   *  .md-strong { font-weight:650 } · task checkboxes 15px, radius 4, accent when checked, strike + faint text
   *  base 14px/1.7 var(--text), caret var(--accent). The wrapper draws the field: hairline border, accent + focus ring on focus.
   */
  planEditor: ReactNode;
  onFormat: (cmd: FormatCommand) => void;
  actionItems: string[];
  onActionItemClick?: (text: string) => void;

  onAddHomework: () => void;
  onRemoveHomework: () => void;
  onHomeworkChange: (text: string) => void;
  onHomeworkOffsetChange: (days: number) => void;
  onMarkPosted: () => void;
  /** "Releases in 3 days" | "Due to post" | "Posted 22 Sept" */
  homeworkStatus: { tone: "neutral" | "warning" | "success"; label: string; detail?: string };

  files: LessonFile[];
  folderPath: string;
  folderExists: boolean;
  onUpload: (files: FileList) => void;
  onOpenFolder: () => void;
  onCopyPath: () => void;
}

const iconBtn = "grid size-7 place-items-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text";
const PRESETS = [1, 3, 7, 14];
const EXT: Record<string, [string, string]> = {
  PDF: ["#fde8e6", "#b3261e"], PNG: ["#e7f0fd", "#1f5fbf"], JPG: ["#e7f0fd", "#1f5fbf"],
  DOCX: ["#e6edfb", "#2b579a"], PPTX: ["#fdeee4", "#b7472a"], XLSX: ["#e3f3e8", "#1f7a45"],
};

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-0.5">
      <h2 className="flex-1 text-[12px] font-semibold text-text-muted">{children}</h2>
      {right}
    </div>
  );
}

export function LessonEditor(p: LessonEditorProps) {
  const { lesson, subject } = p;
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const slot = lesson.slot;
  const offset = lesson.homeworkOffset ?? 3;

  return (
    <aside role="dialog" aria-label="Lesson" className="flex h-full w-[640px] flex-col overflow-hidden border-l border-border bg-surface-raised text-[13px] text-text shadow-float">
      <div className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-surface-raised pl-7 pr-5 pt-3.5">
          <div className="flex h-[30px] items-center gap-2">
            <SubjectPill name={subject.name} color={subject.color} />
            <StatusBadge status={lesson.status} />
            <span className="flex-1" />
            {p.savedAt && (
              <span className="mr-1.5 inline-flex items-center gap-[5px] text-[11px] text-text-faint tabular-nums"><Check size={12} strokeWidth={2.4} />Saved {p.savedAt}</span>
            )}
            <button type="button" aria-label="Previous lesson" className={iconBtn} onClick={p.onPrev} disabled={!p.onPrev}><ChevronUp size={15} /></button>
            <button type="button" aria-label="Next lesson" className={iconBtn} onClick={p.onNext} disabled={!p.onNext}><ChevronDown size={15} /></button>
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button type="button" aria-label="Close" className={iconBtn} onClick={p.onClose}><X size={16} /></button>
          </div>
          <input
            value={p.title}
            placeholder="Add a title"
            aria-label="Lesson title"
            onChange={(e) => p.onTitleChange(e.currentTarget.value)}
            onBlur={p.onBlurSave}
            className="mt-[18px] w-full bg-transparent text-[26px] font-[650] leading-[1.2] tracking-[-0.02em] outline-none placeholder:text-text-faint"
          />
          <div className="mt-2.5 flex items-center gap-3.5 border-b border-border pb-[18px] text-[12.5px] text-text-muted tabular-nums">
            {slot ? (
              <span className="inline-flex items-center gap-1.5"><Calendar size={14} />{longDate(slot.startTime)} · {time(slot.startTime)}–{time(slot.endTime)}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><Calendar size={14} />Not scheduled</span>
            )}
            {slot?.room && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{slot.room}</span>}
            {slot?.group && <span className="inline-flex items-center gap-1.5"><Users size={14} />{slot.group}</span>}
            {p.sequenceLabel && <span className="ml-auto text-[11px] text-text-faint">{p.sequenceLabel}</span>}
          </div>
        </header>

        <div className="flex flex-col gap-[30px] px-7 pb-7 pt-[22px]">
          <section className="flex flex-col gap-2.5">
            <SectionLabel
              right={
                <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5">
                  <button type="button" aria-label="Heading" className={iconBtn} onClick={() => p.onFormat("heading")}><Heading size={14} /></button>
                  <button type="button" aria-label="Bold" className={iconBtn} onClick={() => p.onFormat("bold")}><Bold size={14} /></button>
                  <button type="button" aria-label="Italic" className={iconBtn} onClick={() => p.onFormat("italic")}><Italic size={14} /></button>
                  <span className="mx-[3px] h-3.5 w-px bg-border" />
                  <button type="button" aria-label="Bulleted list" className={iconBtn} onClick={() => p.onFormat("list")}><List size={14} /></button>
                  <button type="button" aria-label="Checklist" className={iconBtn} onClick={() => p.onFormat("checklist")}><SquareCheck size={14} /></button>
                  <button type="button" aria-label="Link" className={iconBtn} onClick={() => p.onFormat("link")}><Link2 size={14} /></button>
                </div>
              }
            >
              Plan
            </SectionLabel>
            <div className="min-h-[120px] rounded-card border border-border bg-surface-raised px-3.5 py-3 transition-shadow focus-within:border-accent focus-within:ring-[3px] focus-within:ring-focus-ring">{p.planEditor}</div>
            {p.actionItems.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-card bg-surface px-2.5 py-2">
                <span className="mr-1 inline-flex items-center gap-[5px] text-[11px] font-medium text-text-muted"><Sparkles size={13} className="text-accent" />Action items found</span>
                {p.actionItems.map((a) => (
                  <button key={a} type="button" onClick={() => p.onActionItemClick?.(a)} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface-raised pl-2 pr-2.5 text-[12px] shadow-[inset_0_0_0_1px_var(--border)] hover:shadow-[inset_0_0_0_1px_var(--border-strong)]">
                    <span className="size-[11px] rounded-[3px] border-[1.5px] border-border-strong" />{a}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            {p.homeworkText === null ? (
              <button type="button" onClick={p.onAddHomework} className="flex h-10 items-center gap-2 rounded-card border border-dashed border-border-strong px-3 text-text-muted hover:bg-surface hover:text-text">
                <Plus size={14} />Add homework
              </button>
            ) : (
              <>
                <SectionLabel right={<Button variant="danger-ghost" size="icon" aria-label="Remove homework" icon={<Trash2 size={14} />} onClick={p.onRemoveHomework} />}>Homework</SectionLabel>
                <div className="overflow-hidden rounded-card border border-border focus-within:border-accent focus-within:ring-[3px] focus-within:ring-focus-ring">
                  <textarea
                    value={p.homeworkText}
                    aria-label="Homework"
                    onChange={(e) => p.onHomeworkChange(e.currentTarget.value)}
                    onBlur={p.onBlurSave}
                    rows={2}
                    className="block w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-[1.55] outline-none"
                  />
                  <div className="flex items-center gap-1.5 border-t border-border bg-surface py-2 pl-3.5 pr-2.5 text-[12px] text-text-muted tabular-nums">
                    <span className="mr-0.5">Remind me</span>
                    {PRESETS.map((d) => (
                      <button key={d} type="button" aria-pressed={offset === d} onClick={() => p.onHomeworkOffsetChange(d)}
                        className={cx("flex h-[22px] min-w-[30px] items-center justify-center rounded-full px-[7px]", offset === d ? "bg-accent font-semibold text-accent-fg" : "bg-surface-raised shadow-[inset_0_0_0_1px_var(--border-strong)] hover:text-text")}>
                        {d}d
                      </button>
                    ))}
                    <input
                      type="number" min={0} placeholder="n" aria-label="Custom days"
                      defaultValue={PRESETS.includes(offset) ? undefined : offset}
                      onChange={(e) => e.currentTarget.value && p.onHomeworkOffsetChange(Number(e.currentTarget.value))}
                      onBlur={p.onBlurSave}
                      className="h-[22px] w-[38px] rounded-md bg-surface-raised px-[7px] shadow-[inset_0_0_0_1px_var(--border-strong)] outline-none placeholder:text-text-faint"
                    />
                    <span>before the lesson</span>
                    {slot && <span className="ml-auto text-text">Release <b className="font-semibold">{dayBefore(slot.startTime, offset)}</b></span>}
                  </div>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cx("inline-flex items-center gap-1.5 text-[12px] font-semibold", { neutral: "text-text-muted", warning: "text-warning", success: "text-success" }[p.homeworkStatus.tone])}>
                    <span className="size-[7px] rounded-full bg-current" />{p.homeworkStatus.label}
                  </span>
                  {p.homeworkStatus.detail && <span className="text-[12px] text-text-muted">{p.homeworkStatus.detail}</span>}
                  <span className="flex-1" />
                  <Button disabled hint="Coming later" icon={<Send size={13} />}>Post to LMS</Button>
                  {!lesson.homeworkPostedAt && <Button variant="primary" icon={<Check size={13} strokeWidth={2.4} />} onClick={p.onMarkPosted}>Mark posted</Button>}
                </div>
              </>
            )}
          </section>

          <section className="flex flex-col gap-2.5">
            <SectionLabel
              right={
                <>
                  <Button variant="ghost" size="sm" icon={<Upload size={13} />} onClick={() => inputRef.current?.click()}>Upload</Button>
                  <Button variant="ghost" size="sm" icon={<FolderOpen size={13} />} onClick={p.onOpenFolder} disabled={!p.folderExists}>Open in File Explorer</Button>
                </>
              }
            >
              Files {p.files.length > 0 && <span className="ml-1 font-normal text-text-faint">{p.files.length}</span>}
            </SectionLabel>
            {p.files.length > 0 && (
              <ul className="flex flex-col">
                {p.files.map((f) => {
                  const ext = f.name.split(".").pop()!.toUpperCase();
                  const [bg, fg] = EXT[ext] ?? ["var(--surface-hover)", "var(--text-muted)"];
                  return (
                    <li key={f.name} className="-mx-2 flex h-9 items-center gap-2.5 rounded-md px-2 tabular-nums hover:bg-surface-hover">
                      <span className="grid size-6 place-items-center rounded-[5px] text-[8.5px] font-bold" style={{ background: bg, color: fg }}>{EXT[ext] ? ext : <File size={13} />}</span>
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="w-14 text-right text-[11px] text-text-muted">{f.size}</span>
                      <span className="w-[52px] text-right text-[11px] text-text-muted">{f.modified}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) p.onUpload(e.dataTransfer.files); }}
              className={cx(
                "flex flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed text-center transition-colors",
                p.files.length ? "h-[84px]" : "h-[132px]",
                dragOver ? "h-[112px] border-accent bg-accent-soft font-semibold text-accent" : "border-border-strong text-text-muted hover:bg-surface"
              )}
            >
              <Upload size={20} strokeWidth={1.8} />
              <span>{dragOver ? "Drop to add files to this lesson" : "Drop files here or click to upload"}</span>
              {!p.folderExists && !dragOver && <span className="text-[11px] font-normal text-text-muted">A folder for this lesson is created on the first upload</span>}
            </button>
            <input ref={inputRef} type="file" multiple hidden onChange={(e) => e.currentTarget.files && p.onUpload(e.currentTarget.files)} />
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-faint">
              <span className="truncate">{p.folderPath}</span>
              <button type="button" aria-label="Copy folder path" onClick={p.onCopyPath} className="grid size-[22px] shrink-0 place-items-center rounded-[5px] hover:bg-surface-hover hover:text-text"><Copy size={12} /></button>
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
