import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Heading2,
  Link2,
  List,
  MapPin,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import type { LessonDTO } from "../../shared/types";
import { useLesson, useLessonAction, useLessonFiles, useLessons, useSaveLesson, useSettings, useSubjects, type LessonSaveResult } from "../api";
import { fmtBytes, fmtDate, fmtDay, fmtSlot, relativeDays } from "../lib/format";
import { Button, cx, Drawer, DrawerClose, Empty, IconButton, Skeleton, StatusBadge, SubjectTag } from "../components/ui";
import { useToast } from "../components/toast";

type Tab = "planning" | "homework" | "files";

export function LessonDrawer({ lessonId, onClose, onNavigate }: { lessonId: string | null; onClose: () => void; onNavigate: (id: string) => void }) {
  const { data: lesson } = useLesson(lessonId);
  return (
    <Drawer open={!!lessonId} onClose={onClose} label="Lesson details">
      {!lesson ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        // Keyed so local edit state resets when moving between lessons.
        <LessonEditor key={lesson.id} lesson={lesson} onClose={onClose} onNavigate={onNavigate} />
      )}
    </Drawer>
  );
}

function LessonEditor({ lesson, onClose, onNavigate }: { lesson: LessonDTO; onClose: () => void; onNavigate: (id: string) => void }) {
  const [tab, setTab] = useState<Tab>("planning");
  const { data: subjects } = useSubjects();
  const { data: siblings } = useLessons(lesson.subjectId);
  const subject = subjects?.find((s) => s.id === lesson.subjectId);
  const save = useSaveLesson(lesson.id);
  const toast = useToast();

  const [title, setTitle] = useState(lesson.title);
  const [bodyText, setBodyText] = useState(lesson.bodyText);
  const [homeworkText, setHomeworkText] = useState(lesson.homeworkText ?? "");
  const [homeworkOffset, setHomeworkOffset] = useState<number | null>(lesson.homeworkOffset);
  const [lastResult, setLastResult] = useState<LessonSaveResult | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Adopt server changes (e.g. template injection) when nothing is pending locally.
  const lastServerBody = useRef(lesson.bodyText);
  useEffect(() => {
    if (lesson.bodyText !== lastServerBody.current) {
      lastServerBody.current = lesson.bodyText;
      setBodyText(lesson.bodyText);
    }
  }, [lesson.bodyText]);

  const dirty =
    title.trim() !== lesson.title ||
    bodyText !== lesson.bodyText ||
    (homeworkText || null) !== (lesson.homeworkText || null) ||
    homeworkOffset !== lesson.homeworkOffset;

  const doSave = () => {
    if (!dirty || save.isPending) return;
    const patch = {
      ...(title.trim() !== lesson.title && { title: title.trim() }),
      ...(bodyText !== lesson.bodyText && { bodyText }),
      ...((homeworkText || null) !== (lesson.homeworkText || null) && { homeworkText: homeworkText || null }),
      ...(homeworkOffset !== lesson.homeworkOffset && { homeworkOffset }),
    };
    lastServerBody.current = bodyText;
    save.mutate(patch, {
      onSuccess: (r) => {
        setSavedAt(new Date());
        if (r.actionItems) setLastResult(r);
        if (r.actionItems?.length) toast({ kind: "success", text: `${r.actionItems.length} action item${r.actionItems.length > 1 ? "s" : ""} added to your task list` });
        if (r.warning) toast({ kind: "error", text: `Action-item AI unavailable, used keyword matching: ${r.warning}` });
      },
      onError: (e) => toast({ kind: "error", text: `Save failed: ${e.message}` }),
    });
  };

  // Autosave after a pause in typing.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(doSave, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyText, homeworkText, homeworkOffset]);

  // Flush pending edits however the editor goes away (Esc, scrim click, switching lesson).
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  useEffect(() => () => saveRef.current(), []);

  const idx = siblings?.findIndex((l) => l.id === lesson.id) ?? -1;
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && siblings && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      if (typing) {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") (e.preventDefault(), doSave());
        return;
      }
      if (e.key === "ArrowUp" && prev) (e.preventDefault(), doSave(), onNavigate(prev.id));
      if (e.key === "ArrowDown" && next) (e.preventDefault(), doSave(), onNavigate(next.id));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const close = () => {
    doSave();
    onClose();
  };

  return (
    <>
      <div className="border-b border-line px-5 pt-3 pb-0">
        <div className="flex items-center gap-2">
          {subject && <SubjectTag name={subject.name} color={subject.color} size="md" />}
          <span className="font-mono text-xs text-faint">#{lesson.sequenceOrder + 1}</span>
          <StatusBadge status={lesson.status} />
          <span className="ml-auto text-[11px] text-faint" aria-live="polite">
            {save.isPending ? "Saving…" : dirty ? "Unsaved" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
          <IconButton label="Previous lesson (↑)" disabled={!prev} onClick={() => prev && (doSave(), onNavigate(prev.id))}>
            <ChevronUp className="size-4" />
          </IconButton>
          <IconButton label="Next lesson (↓)" disabled={!next} onClick={() => next && (doSave(), onNavigate(next.id))}>
            <ChevronDown className="size-4" />
          </IconButton>
          <DrawerClose onClose={close} />
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={doSave}
          aria-label="Lesson title"
          placeholder={`Lesson ${lesson.sequenceOrder + 1}`}
          className="mt-2 w-full rounded-md bg-transparent px-1 -mx-1 text-xl font-semibold outline-none hover:bg-hover focus:bg-hover"
        />
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1 font-mono">
            <CalendarClock className="size-3.5" />
            {lesson.slot ? fmtSlot(lesson.slot.startTime, lesson.slot.endTime) : "Unscheduled"}
          </span>
          {lesson.slot?.room && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" />
              {lesson.slot.room}
            </span>
          )}
          {lesson.slot?.group && <span>{lesson.slot.group}</span>}
        </div>
        <div role="tablist" className="mt-3 flex gap-4">
          {(["planning", "homework", "files"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cx("-mb-px border-b-2 pb-2 text-[13px] capitalize", tab === t ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg")}
            >
              {t === "files" ? "Local files" : t}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "planning" && <PlanningTab bodyText={bodyText} setBodyText={setBodyText} onBlur={doSave} lastResult={lastResult} />}
        {tab === "homework" && (
          <HomeworkTab lesson={lesson} text={homeworkText} setText={setHomeworkText} offset={homeworkOffset} setOffset={setHomeworkOffset} dirty={dirty} onBlur={doSave} />
        )}
        {tab === "files" && <FilesTab lesson={lesson} />}
      </div>
    </>
  );
}

function PlanningTab({
  bodyText,
  setBodyText,
  onBlur,
  lastResult,
}: {
  bodyText: string;
  setBodyText: (s: string) => void;
  onBlur: () => void;
  lastResult: LessonSaveResult | null;
}) {
  const [mode, setMode] = useState<"write" | "preview" | "split">("write");
  const ta = useRef<HTMLTextAreaElement>(null);

  /** Wraps the selection or prefixes the current line — minimal Markdown toolbar. */
  const format = (kind: "h2" | "bold" | "list" | "check" | "link") => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = bodyText.slice(s, e);
    const lineStart = bodyText.lastIndexOf("\n", s - 1) + 1;
    let next = bodyText;
    let caret = e;
    const prefix = { h2: "## ", list: "- ", check: "- [ ] " } as const;
    if (kind === "bold" || kind === "link") {
      const wrapped = kind === "bold" ? `**${sel || "bold"}**` : `[${sel || "link"}](https://)`;
      next = bodyText.slice(0, s) + wrapped + bodyText.slice(e);
      caret = s + wrapped.length;
    } else {
      next = bodyText.slice(0, lineStart) + prefix[kind] + bodyText.slice(lineStart);
      caret = e + prefix[kind].length;
    }
    setBodyText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  const preview = (
    <div className="prose-lesson min-h-[320px] rounded-md border border-line bg-raised p-3">
      {bodyText.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyText}</ReactMarkdown> : <span className="text-faint">Nothing to preview yet.</span>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-0.5 rounded-md border border-line bg-raised p-1">
        <IconButton label="Heading" onClick={() => format("h2")} disabled={mode === "preview"}>
          <Heading2 className="size-4" />
        </IconButton>
        <IconButton label="Bold" onClick={() => format("bold")} disabled={mode === "preview"}>
          <Bold className="size-4" />
        </IconButton>
        <IconButton label="Bullet list" onClick={() => format("list")} disabled={mode === "preview"}>
          <List className="size-4" />
        </IconButton>
        <IconButton label="Checklist item" onClick={() => format("check")} disabled={mode === "preview"}>
          <CheckSquare className="size-4" />
        </IconButton>
        <IconButton label="Link" onClick={() => format("link")} disabled={mode === "preview"}>
          <Link2 className="size-4" />
        </IconButton>
        <div className="ml-auto flex rounded-md bg-hover p-0.5 text-xs">
          {(["write", "split", "preview"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={cx("rounded px-2 py-0.5 capitalize", mode === m ? "bg-raised font-medium text-fg shadow-sm" : "text-muted")}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className={cx(mode === "split" && "grid grid-cols-2 gap-2")}>
        {mode !== "preview" && (
          <textarea
            ref={ta}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            onBlur={onBlur}
            placeholder="Plan this lesson in Markdown…"
            aria-label="Lesson notes"
            className="min-h-[320px] w-full resize-y rounded-md border border-line bg-raised p-3 font-mono text-[12.5px] leading-relaxed outline-none focus:border-line-strong"
          />
        )}
        {mode !== "write" && preview}
      </div>
      <div className="flex justify-between text-[11px] text-faint">
        <span>Markdown · Ctrl/⌘+S saves · autosaves after a pause</span>
        <span className="tabular-nums">{bodyText.length} chars</span>
      </div>

      {lastResult?.actionItems && lastResult.actionItems.length > 0 && (
        <div className="rounded-md border border-line bg-raised p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium">
            <Sparkles className="size-3.5 text-accent" /> Action items found · added to tasks
          </div>
          <div className="flex flex-wrap gap-1.5">
            {lastResult.actionItems.map((a) => (
              <span key={a.title} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs">
                {a.title}
                <span className="text-faint">due {fmtDay(a.dueDate)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HomeworkTab({
  lesson,
  text,
  setText,
  offset,
  setOffset,
  dirty,
  onBlur,
}: {
  lesson: LessonDTO;
  text: string;
  setText: (s: string) => void;
  offset: number | null;
  setOffset: (n: number | null) => void;
  dirty: boolean;
  onBlur: () => void;
}) {
  const action = useLessonAction(lesson.id);
  const toast = useToast();
  const release = useMemo(() => {
    if (!lesson.slot || offset == null) return null;
    const d = new Date(lesson.slot.startTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  }, [lesson.slot, offset]);
  const today = new Date(new Date().toDateString());
  const status = lesson.homeworkPostedAt
    ? { label: `Posted ${fmtDate(lesson.homeworkPostedAt)} · Manual`, cls: "text-success" }
    : !text.trim() || !release
      ? { label: "No reminder set", cls: "text-faint" }
      : release <= today
        ? { label: "Due to post", cls: "text-warning font-medium" }
        : { label: `Not yet due · releases ${relativeDays(release.toISOString())}`, cls: "text-muted" };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="hw" className="mb-1.5 block text-[11px] font-medium tracking-wide text-faint uppercase">
          Homework
        </label>
        <textarea
          id="hw"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={onBlur}
          placeholder="e.g. Read p. 42–45 and answer questions 1–6."
          className="min-h-[140px] w-full resize-y rounded-md border border-line bg-raised p-3 text-[13px] outline-none focus:border-line-strong"
        />
      </div>

      <div className="rounded-md border border-line bg-raised p-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          Remind me
          <input
            type="number"
            min={0}
            max={60}
            value={offset ?? ""}
            placeholder="–"
            onChange={(e) => setOffset(e.target.value === "" ? null : Math.max(0, Math.min(60, Number(e.target.value))))}
            onBlur={onBlur}
            aria-label="Days before lesson"
            className="h-7 w-14 rounded-md border border-line bg-surface px-2 text-center font-mono outline-none focus:border-line-strong"
          />
          days before the lesson
        </div>
        <div className="mt-2 flex gap-1.5">
          {[1, 3, 7, 14].map((n) => (
            <button key={n} onClick={() => setOffset(n)} className={cx("h-6 rounded-full border px-2 text-xs", offset === n ? "border-accent/50 bg-accent-soft" : "border-line text-muted hover:border-line-strong")}>
              {n}d
            </button>
          ))}
          {offset != null && (
            <button onClick={() => setOffset(null)} className="h-6 px-2 text-xs text-faint hover:text-fg">
              Clear
            </button>
          )}
        </div>
        <div className="mt-3 text-xs text-muted">
          {release ? <>Release on <span className="font-medium text-fg">{fmtDay(release)}</span></> : lesson.slot ? "Set a number of days to schedule a reminder." : "This lesson has no calendar slot, so it can't be scheduled."}
        </div>
        <div className={cx("mt-1 text-xs", status.cls)}>{status.label}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        {lesson.homeworkPostedAt ? (
          <Button icon={<Undo2 className="size-3.5" />} onClick={() => action.mutate({ kind: "unpost" })} loading={action.isPending}>
            Mark as not posted
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={<CheckSquare className="size-3.5" />}
            disabled={!text.trim() || dirty}
            loading={action.isPending}
            onClick={() => action.mutate({ kind: "post" }, { onSuccess: () => toast({ kind: "success", text: "Homework marked as posted" }), onError: (e) => toast({ kind: "error", text: e.message }) })}
            title={dirty ? "Saving changes first…" : undefined}
          >
            Mark posted
          </Button>
        )}
        <Button icon={<Send className="size-3.5" />} disabled title="Lectio / Google Classroom posting is coming in V2">
          Post to LMS
        </Button>
      </div>
    </div>
  );
}

function FilesTab({ lesson }: { lesson: LessonDTO }) {
  const { data: files, isLoading } = useLessonFiles(lesson.id, true);
  const { data: settings } = useSettings();
  const action = useLessonAction(lesson.id);
  const toast = useToast();
  const opener = settings?.platform === "darwin" ? "Finder" : settings?.platform === "win32" ? "File Explorer" : "file manager";
  const path = files?.folderPath ?? lesson.folderPath;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-raised p-3">
        <div className="mb-1 text-[11px] font-medium tracking-wide text-faint uppercase">Lesson folder</div>
        {path ? (
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted" title={path}>
              {path}
            </code>
            <IconButton label="Copy path" onClick={() => navigator.clipboard.writeText(path).then(() => toast({ kind: "success", text: "Path copied" }))}>
              <Copy className="size-3.5" />
            </IconButton>
          </div>
        ) : (
          <div className="text-xs text-faint">No folder yet. Create one to keep worksheets, slides and lab sheets for this lesson.</div>
        )}
        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            icon={<FolderOpen className="size-3.5" />}
            loading={action.isPending && action.variables?.kind === "open"}
            onClick={() => action.mutate({ kind: "open" }, { onError: (e) => toast({ kind: "error", text: e.message }) })}
          >
            Open in {opener}
          </Button>
          {!files?.exists && (
            <Button icon={<FolderPlus className="size-3.5" />} loading={action.isPending && action.variables?.kind === "folder"} onClick={() => action.mutate({ kind: "folder" })}>
              Create folder
            </Button>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Files</div>
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : !files?.files.length ? (
          <Empty icon={<Folder className="size-6" />} title="No files yet">
            Drop worksheets, slides and lab sheets into the folder. They'll show up here.
          </Empty>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-raised">
            {files.files.map((f) => (
              <li key={f.name} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                {f.isDirectory ? <Folder className="size-4 text-faint" /> : <File className="size-4 text-faint" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {!f.isDirectory && <span className="text-xs text-faint tabular-nums">{fmtBytes(f.size)}</span>}
                <span className="w-16 text-right text-xs text-faint">{fmtDate(f.modifiedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
