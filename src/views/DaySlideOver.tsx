import { CalendarX, File, Folder, Send } from "lucide-react";
import { useDay } from "../api";
import { useNav } from "../nav";
import { fmtTime } from "../lib/format";
import { lessonLabel } from "../../shared/planning";
import { Button, Drawer, DrawerClose, Empty, Skeleton, StatusBadge, SubjectTag } from "../components/ui";

export function DaySlideOver({ date, onClose }: { date: string | null; onClose: () => void }) {
  const { data, isLoading } = useDay(date);
  const { openLesson } = useNav();
  const title = date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : "";

  return (
    <Drawer open={!!date} onClose={onClose} width={440} label={`Lessons on ${title}`}>
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
        <DrawerClose onClose={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="mb-2 h-24" />)}
        {data?.length === 0 && <Empty icon={<CalendarX className="size-6" />} title="No lessons scheduled" />}
        <div className="flex flex-col gap-2">
          {data?.map((l) => (
            <article key={l.id} className="rounded-md border border-line bg-raised p-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">{l.slot && `${fmtTime(l.slot.startTime)}–${fmtTime(l.slot.endTime)}`}</span>
                <SubjectTag name={l.subjectName} color={l.subjectColor} />
                <span className="ml-auto">
                  <StatusBadge status={l.status} />
                </span>
              </div>
              <div className="mt-1.5 text-[13px] font-medium">{lessonLabel(l)}</div>
              {l.slot?.room && <div className="text-[11px] text-faint">Room {l.slot.room}</div>}

              <div className="mt-2 space-y-1 text-xs text-muted">
                <div className="flex items-center gap-1.5">
                  <Folder className="size-3.5 text-faint" />
                  {l.folderPath ? (l.files.total ? `${l.files.total} file${l.files.total > 1 ? "s" : ""}` : "Folder is empty") : "No folder"}
                </div>
                {l.files.names.map((n) => (
                  <div key={n} className="flex items-center gap-1.5 pl-5 text-faint">
                    <File className="size-3" />
                    <span className="truncate">{n}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <Send className="size-3.5 text-faint" />
                  {!l.homeworkText ? "No homework" : l.homeworkPostedAt ? <span className="text-success">Homework posted</span> : <span>Homework not posted</span>}
                </div>
              </div>
              <div className="mt-2.5">
                <Button size="sm" onClick={() => openLesson(l.id)}>
                  Open lesson
                </Button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Drawer>
  );
}
