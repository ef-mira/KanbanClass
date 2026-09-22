import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { NavContext, type Nav, type View } from "./nav";
import { Dashboard } from "./views/Dashboard";
import { KanbanBoard } from "./views/KanbanBoard";
import { Settings } from "./views/Settings";
import { LessonDrawer } from "./views/LessonDrawer";
import { DaySlideOver } from "./views/DaySlideOver";

const TITLES: Record<View, string> = { dashboard: "Dashboard", board: "Subjects board", settings: "Calendar & settings" };

function readHash(): View {
  const h = location.hash.replace("#/", "");
  return h === "board" || h === "settings" ? h : "dashboard";
}

export function App() {
  const [view, setView] = useState<View>(readHash);
  const [focusSubjectId, setFocusSubjectId] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((v: View, opts?: { subjectId?: string }) => {
    setFocusSubjectId(opts?.subjectId ?? null);
    location.hash = `#/${v}`;
    setView(v);
  }, []);

  const nav: Nav = useMemo(
    () => ({ view, go, focusSubjectId, openLesson: setLessonId, openDay: setDay }),
    [view, go, focusSubjectId],
  );

  return (
    <NavContext.Provider value={nav}>
      <div className="flex h-full">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
            <h1 className="text-[15px] font-semibold">{TITLES[view]}</h1>
            <span className="text-xs text-faint">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </header>
          <div className="min-h-0 flex-1">
            {view === "dashboard" && <Dashboard />}
            {view === "board" && <KanbanBoard />}
            {view === "settings" && <Settings />}
          </div>
        </main>
      </div>
      <DaySlideOver date={day} onClose={() => setDay(null)} />
      <LessonDrawer lessonId={lessonId} onClose={() => setLessonId(null)} onNavigate={setLessonId} />
    </NavContext.Provider>
  );
}
