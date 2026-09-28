import { useEffect, useMemo, useRef, useState } from "react";
import type { LessonDTO } from "../../shared/types";
import { useLesson, useLessonAction, useLessonFiles, useLessons, useSaveLesson, useSettings, useSubjects, useUploadFiles, type LessonSaveResult } from "../api";
import { LessonEditor, type FormatCommand, type LessonFile } from "../ui/LessonEditor";
import { dayBefore, fmtBytes, longDate, relativeDays, shortDate } from "../ui/format";
import { MarkdownEditor, type MarkdownEditorHandle, type MarkdownFormat } from "../components/MarkdownEditor";
import { Skeleton } from "../components/ui";
import { useToast } from "../components/toast";

const FORMAT: Record<FormatCommand, MarkdownFormat> = {
  heading: "h2",
  bold: "bold",
  italic: "italic",
  list: "list",
  checklist: "check",
  link: "link",
};

export function LessonDrawer({ lessonId, onClose, onNavigate }: { lessonId: string | null; onClose: () => void; onNavigate: (id: string) => void }) {
  const { data: lesson } = useLesson(lessonId);
  const open = !!lessonId;

  // Esc closes; the editor itself owns the rest of the keyboard handling.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="animate-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div className="animate-drawer relative h-full max-w-full">
        {lesson ? (
          // Keyed so draft state resets when moving between lessons.
          <Editor key={lesson.id} lesson={lesson} onClose={onClose} onNavigate={onNavigate} />
        ) : (
          <div className="flex h-full w-[640px] flex-col gap-3 border-l border-border bg-surface-raised p-7">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-64" />
          </div>
        )}
      </div>
    </div>
  );
}

function Editor({ lesson, onClose, onNavigate }: { lesson: LessonDTO; onClose: () => void; onNavigate: (id: string) => void }) {
  const { data: subjects } = useSubjects();
  const { data: siblings } = useLessons(lesson.subjectId);
  const { data: files } = useLessonFiles(lesson.id, true);
  const { data: settings } = useSettings();
  const subject = subjects?.find((s) => s.id === lesson.subjectId);
  const save = useSaveLesson(lesson.id);
  const action = useLessonAction(lesson.id);
  const upload = useUploadFiles(lesson.id);
  const toast = useToast();
  const editor = useRef<MarkdownEditorHandle>(null);

  const [title, setTitle] = useState(lesson.title);
  const [bodyText, setBodyText] = useState(lesson.bodyText);
  const [homeworkText, setHomeworkText] = useState<string | null>(lesson.homeworkText);
  const [homeworkOffset, setHomeworkOffset] = useState<number | null>(lesson.homeworkOffset);
  const [lastResult, setLastResult] = useState<LessonSaveResult | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const dirty =
    title.trim() !== lesson.title ||
    bodyText !== lesson.bodyText ||
    (homeworkText || null) !== (lesson.homeworkText || null) ||
    homeworkOffset !== lesson.homeworkOffset;

  const doSave = () => {
    if (!dirty || save.isPending) return;
    save.mutate(
      {
        ...(title.trim() !== lesson.title && { title: title.trim() }),
        ...(bodyText !== lesson.bodyText && { bodyText }),
        ...((homeworkText || null) !== (lesson.homeworkText || null) && { homeworkText: homeworkText || null }),
        ...(homeworkOffset !== lesson.homeworkOffset && { homeworkOffset }),
      },
      {
        onSuccess: (r) => {
          setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
          if (r.actionItems) setLastResult(r);
          if (r.warning) toast({ kind: "error", text: `Action-item AI unavailable, used keyword matching: ${r.warning}` });
        },
        onError: (e) => toast({ kind: "error", text: `Save failed: ${e.message}` }),
      },
    );
  };

  // Autosave after a pause, and flush however the editor goes away.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(doSave, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, bodyText, homeworkText, homeworkOffset]);
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  useEffect(() => () => saveRef.current(), []);

  const idx = siblings?.findIndex((l) => l.id === lesson.id) ?? -1;
  const prev = idx > 0 ? siblings![idx - 1] : null;
  const next = idx >= 0 && siblings && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const goTo = (id: string) => {
    doSave();
    onNavigate(id);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") (e.preventDefault(), doSave());
        return;
      }
      if (e.key === "ArrowUp" && prev) (e.preventDefault(), goTo(prev.id));
      if (e.key === "ArrowDown" && next) (e.preventDefault(), goTo(next.id));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const release = useMemo(() => {
    if (!lesson.slot || homeworkOffset == null) return null;
    const d = new Date(lesson.slot.startTime);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - homeworkOffset);
  }, [lesson.slot, homeworkOffset]);

  const today = new Date(new Date().toDateString());
  const homeworkStatus: { tone: "neutral" | "warning" | "success"; label: string; detail?: string } = lesson.homeworkPostedAt
    ? { tone: "success", label: `Posted ${longDate(lesson.homeworkPostedAt)}` }
    : !release
      ? { tone: "neutral", label: "No reminder set", detail: lesson.slot ? undefined : "This lesson has no calendar slot" }
      : release <= today
        ? { tone: "warning", label: "Due to post", detail: `Release date was ${longDate(release)}` }
        : { tone: "neutral", label: `Releases ${relativeDays(release)}`, detail: dayBefore(lesson.slot!.startTime, homeworkOffset!) };

  const editorFiles: LessonFile[] = (files?.files ?? []).map((f) => ({
    name: f.name,
    size: f.isDirectory ? "folder" : fmtBytes(f.size),
    modified: shortDate(f.modifiedAt),
  }));
  const folderPath = files?.folderPath ?? lesson.folderPath ?? `${settings?.teachingRoot ?? ""}…`;

  return (
    <LessonEditor
      lesson={lesson}
      subject={subject ?? { name: "—", color: "#64748b" }}
      sequenceLabel={siblings?.length ? `Lesson ${idx + 1} of ${siblings.length}` : undefined}
      savedAt={save.isPending ? "…" : dirty ? null : savedAt}
      title={title}
      homeworkText={homeworkText}
      onClose={() => {
        doSave();
        onClose();
      }}
      onPrev={prev ? () => goTo(prev.id) : undefined}
      onNext={next ? () => goTo(next.id) : undefined}
      onTitleChange={setTitle}
      onBlurSave={doSave}
      planEditor={
        <MarkdownEditor
          ref={editor}
          value={bodyText}
          onChange={setBodyText}
          onBlur={doSave}
          placeholder="Write the plan. Type ## for a heading, - [ ] for a to-do."
        />
      }
      onFormat={(cmd) => editor.current?.format(FORMAT[cmd])}
      actionItems={lastResult?.actionItems?.map((a) => a.title) ?? []}
      onAddHomework={() => {
        setHomeworkText("");
        if (homeworkOffset == null) setHomeworkOffset(3);
      }}
      onRemoveHomework={() => {
        setHomeworkText(null);
        setHomeworkOffset(null);
      }}
      onHomeworkChange={setHomeworkText}
      onHomeworkOffsetChange={setHomeworkOffset}
      onMarkPosted={() =>
        action.mutate(
          { kind: "post" },
          { onSuccess: () => toast({ kind: "success", text: "Homework marked as posted" }), onError: (e) => toast({ kind: "error", text: e.message }) },
        )
      }
      homeworkStatus={homeworkStatus}
      files={editorFiles}
      folderPath={folderPath}
      folderExists={!!files?.exists}
      onUpload={(list) =>
        upload.mutate(Array.from(list), {
          onSuccess: (names) => toast({ kind: "success", text: `Added ${names.length === 1 ? names[0] : `${names.length} files`} to the lesson folder` }),
          onError: (e) => toast({ kind: "error", text: e.message }),
        })
      }
      onOpenFolder={() => action.mutate({ kind: "open" }, { onError: (e) => toast({ kind: "error", text: e.message }) })}
      onOpenFile={(name) => action.mutate({ kind: "openFile", name }, { onError: (e) => toast({ kind: "error", text: e.message }) })}
      onCopyPath={() => navigator.clipboard.writeText(folderPath).then(() => toast({ kind: "success", text: "Path copied" }))}
    />
  );
}
