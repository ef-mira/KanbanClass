import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Bold,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  File,
  FileText,
  Folder,
  FolderOpen,
  Heading2,
  Italic,
  Link2,
  List,
  MapPin,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import type { LessonDTO } from "../../shared/types";
import { useLesson, useLessonAction, useLessonFiles, useLessons, useSaveLesson, useSettings, useSubjects, useUploadFiles, type LessonSaveResult } from "../api";
import { fmtBytes, fmtDate, fmtDay, fmtSlot, relativeDays } from "../lib/format";
import { Button, cx, Drawer, DrawerClose, IconButton, Skeleton, StatusBadge, SubjectTag } from "../components/ui";
import { MarkdownEditor, type MarkdownEditorHandle, type MarkdownFormat } from "../components/MarkdownEditor";
import { useToast } from "../components/toast";

export function LessonDrawer({ lessonId, onClose, onNavigate }: { lessonId: string | null; onClose: () => void; onNavigate: (id: string) => void }) {
  const { data: lesson } = useLesson(lessonId);
  return (
    <Drawer open={!!lessonId} onClose={onClose} width={640} label="Edit lesson">
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
      const target = e.target instanceof Element ? e.target : null;
      const typing = target?.closest("input, textarea, select, [contenteditable]");
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
      <div className="border-b border-line px-6 pt-3 pb-4">
        <div className="flex items-center gap-2">
          {subject && <SubjectTag name={subject.name} color={subject.color} size="md" />}
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
          placeholder="Add a title"
          className="-mx-1 mt-2 w-full rounded-md bg-transparent px-1 text-xl font-semibold outline-none placeholder:text-faint hover:bg-hover focus:bg-hover"
        />
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
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
      </div>

      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-5">
        <PlanSection bodyText={bodyText} setBodyText={setBodyText} onBlur={doSave} lastResult={lastResult} />
        <HomeworkSection lesson={lesson} text={homeworkText} setText={setHomeworkText} offset={homeworkOffset} setOffset={setHomeworkOffset} dirty={dirty} onBlur={doSave} />
        <FilesSection lesson={lesson} />
      </div>
    </>
  );
}

function SectionHeading({ icon, children, actions }: { icon: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-faint">{icon}</span>
      <h3 className="text-[13px] font-semibold">{children}</h3>
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  );
}

function PlanSection({
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
  const editor = useRef<MarkdownEditorHandle>(null);
  const tools: { kind: MarkdownFormat; label: string; icon: ReactNode }[] = [
    { kind: "h2", label: "Heading", icon: <Heading2 className="size-4" /> },
    { kind: "bold", label: "Bold", icon: <Bold className="size-4" /> },
    { kind: "italic", label: "Italic", icon: <Italic className="size-4" /> },
    { kind: "list", label: "Bullet list", icon: <List className="size-4" /> },
    { kind: "check", label: "Checklist item", icon: <CheckSquare className="size-4" /> },
    { kind: "link", label: "Link", icon: <Link2 className="size-4" /> },
  ];

  return (
    <section>
      <SectionHeading
        icon={<FileText className="size-4" />}
        actions={tools.map((t) => (
          <IconButton key={t.kind} label={t.label} onMouseDown={(e) => e.preventDefault()} onClick={() => editor.current?.format(t.kind)}>
            {t.icon}
          </IconButton>
        ))}
      >
        Plan
      </SectionHeading>
      <div className="rounded-lg border border-line bg-raised px-4 py-2 focus-within:border-line-strong" onClick={() => editor.current?.focus()}>
        <MarkdownEditor ref={editor} value={bodyText} onChange={setBodyText} onBlur={onBlur} placeholder="Write the plan… (# heading, **bold**, - list, - [ ] to-do)" />
      </div>
      <div className="mt-1.5 text-[11px] text-faint">Markdown formats as you type · Ctrl/⌘+S saves · autosaves after a pause</div>

      {lastResult?.actionItems && lastResult.actionItems.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface p-3">
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
    </section>
  );
}

function HomeworkSection({
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
  const [adding, setAdding] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const release = useMemo(() => {
    if (!lesson.slot || offset == null) return null;
    const d = new Date(lesson.slot.startTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  }, [lesson.slot, offset]);

  const hasHomework = !!text.trim() || adding;
  if (!hasHomework)
    return (
      <section>
        <SectionHeading icon={<BookOpen className="size-4" />}>Homework</SectionHeading>
        <button
          onClick={() => {
            setAdding(true);
            if (offset == null) setOffset(7);
            requestAnimationFrame(() => area.current?.focus());
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[13px] text-muted hover:bg-hover hover:text-fg"
        >
          <Plus className="size-4" /> Add homework
        </button>
      </section>
    );

  const today = new Date(new Date().toDateString());
  const status = lesson.homeworkPostedAt
    ? { label: `Posted ${fmtDate(lesson.homeworkPostedAt)}`, cls: "text-success" }
    : !release
      ? { label: "No reminder", cls: "text-faint" }
      : release <= today
        ? { label: "Due to post", cls: "text-warning font-medium" }
        : { label: `Releases ${relativeDays(release.toISOString())}`, cls: "text-muted" };

  return (
    <section>
      <SectionHeading
        icon={<BookOpen className="size-4" />}
        actions={
          <IconButton
            label="Remove homework"
            onClick={() => {
              setText("");
              setOffset(null);
              setAdding(false);
            }}
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        }
      >
        Homework
      </SectionHeading>
      <div className="rounded-lg border border-line bg-raised focus-within:border-line-strong">
        <textarea
          ref={area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={onBlur}
          placeholder="e.g. Read p. 42–45 and answer questions 1–6."
          aria-label="Homework"
          className="block min-h-[84px] w-full resize-y rounded-t-lg bg-transparent px-4 py-3 text-[14px] outline-none placeholder:text-faint"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line px-4 py-2.5 text-[13px]">
          <span className="text-muted">Remind me</span>
          <div className="flex gap-1">
            {[1, 3, 7, 14].map((n) => (
              <button
                key={n}
                onClick={() => setOffset(n)}
                className={cx("h-6 rounded-full border px-2 text-xs", offset === n ? "border-accent/50 bg-accent-soft font-medium" : "border-line text-muted hover:border-line-strong")}
              >
                {n}d
              </button>
            ))}
            <input
              type="number"
              min={0}
              max={60}
              value={offset ?? ""}
              placeholder="–"
              onChange={(e) => setOffset(e.target.value === "" ? null : Math.max(0, Math.min(60, Number(e.target.value))))}
              onBlur={onBlur}
              aria-label="Days before lesson"
              className="h-6 w-12 rounded-full border border-line bg-surface px-2 text-center text-xs outline-none focus:border-line-strong"
            />
          </div>
          <span className="text-muted">before the lesson</span>
          <span className="ml-auto text-xs text-muted">{release ? <>Release {fmtDay(release)}</> : lesson.slot ? "" : "No slot to schedule from"}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cx("text-xs", status.cls)}>{status.label}</span>
        <div className="ml-auto flex gap-2">
          {lesson.homeworkPostedAt ? (
            <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => action.mutate({ kind: "unpost" })} loading={action.isPending}>
              Mark as not posted
            </Button>
          ) : (
            <Button
              size="sm"
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
          <Button size="sm" icon={<Send className="size-3.5" />} disabled title="Posting to Lectio / Google Classroom is coming later">
            Post to LMS
          </Button>
        </div>
      </div>
    </section>
  );
}

function FilesSection({ lesson }: { lesson: LessonDTO }) {
  const { data: files } = useLessonFiles(lesson.id, true);
  const { data: settings } = useSettings();
  const action = useLessonAction(lesson.id);
  const upload = useUploadFiles(lesson.id);
  const toast = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const opener = settings?.platform === "darwin" ? "Finder" : settings?.platform === "win32" ? "File Explorer" : "file manager";
  const path = files?.folderPath ?? lesson.folderPath;
  const list = files?.files ?? [];

  const send = (picked: FileList | File[] | null) => {
    const arr = picked ? Array.from(picked) : [];
    if (!arr.length) return;
    upload.mutate(arr, {
      onSuccess: (names) => toast({ kind: "success", text: `Added ${names.length === 1 ? names[0] : `${names.length} files`} to the lesson folder` }),
      onError: (e) => toast({ kind: "error", text: e.message }),
    });
  };

  return (
    <section
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        send(e.dataTransfer.files);
      }}
    >
      <SectionHeading
        icon={<Paperclip className="size-4" />}
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<Upload className="size-3.5" />} loading={upload.isPending} onClick={() => picker.current?.click()}>
              Upload
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<FolderOpen className="size-3.5" />}
              loading={action.isPending && action.variables?.kind === "open"}
              onClick={() => action.mutate({ kind: "open" }, { onError: (e) => toast({ kind: "error", text: e.message }) })}
            >
              Open in {opener}
            </Button>
          </>
        }
      >
        Files
      </SectionHeading>
      <input ref={picker} type="file" multiple hidden onChange={(e) => (send(e.target.files), (e.target.value = ""))} />

      <div className={cx("rounded-lg border transition-colors", over ? "border-accent bg-accent-soft" : list.length ? "border-line bg-raised" : "border-dashed border-line-strong")}>
        {list.length > 0 && (
          <ul className="divide-y divide-line">
            {list.map((f) => (
              <li key={f.name} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                {f.isDirectory ? <Folder className="size-4 text-faint" /> : <File className="size-4 text-faint" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                {!f.isDirectory && <span className="text-xs text-faint tabular-nums">{fmtBytes(f.size)}</span>}
                <span className="w-14 text-right text-xs text-faint">{fmtDate(f.modifiedAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <button onClick={() => picker.current?.click()} className={cx("flex w-full items-center justify-center gap-2 px-4 text-[13px] text-muted hover:text-fg", list.length ? "border-t border-line py-2.5" : "py-6")}>
          <Upload className="size-4" />
          {upload.isPending ? "Uploading…" : over ? "Drop to add to this lesson" : "Drop files here or click to upload"}
        </button>
      </div>
      {path && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
          <span className="min-w-0 truncate font-mono" title={path}>
            {path}
          </span>
          <button className="shrink-0 rounded p-0.5 hover:bg-hover hover:text-fg" aria-label="Copy folder path" onClick={() => navigator.clipboard.writeText(path).then(() => toast({ kind: "success", text: "Path copied" }))}>
            <Copy className="size-3" />
          </button>
        </div>
      )}
      {!path && <div className="mt-1.5 text-[11px] text-faint">The lesson folder is created when you add the first file.</div>}
    </section>
  );
}
