import { useState } from "react";
import { CalendarCog, Eye, EyeOff, KanbanSquare, LayoutDashboard, Monitor, Moon, PanelLeftClose, PanelLeftOpen, RefreshCw, Sun } from "lucide-react";
import { useSettings, useSubjects, useSync, useUpdateSubject } from "../api";
import { useNav, type View } from "../nav";
import { useThemePref, type ThemePref } from "../lib/theme";
import { fmtTime, relativeDays } from "../lib/format";
import { cx, IconButton } from "./ui";
import { useToast } from "./toast";

const NAV: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "board", label: "Subjects board", icon: KanbanSquare },
  { view: "settings", label: "Calendar & settings", icon: CalendarCog },
];

export function Sidebar() {
  const nav = useNav();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar") === "collapsed";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };
  const { data: subjects } = useSubjects();
  const { data: settings } = useSettings();
  const updateSubject = useUpdateSubject();
  const sync = useSync();
  const toast = useToast();
  const [theme, setTheme] = useThemePref();

  const runSync = () => {
    if (!settings?.icalUrl) {
      nav.go("settings");
      toast({ kind: "info", text: "Add your calendar feed URL to sync, or load the sample timetable." });
      return;
    }
    sync.mutate(
      { kind: "feed" },
      {
        onSuccess: (r) =>
          toast({ kind: "success", text: `Synced ${r.fetched} events · ${r.created} new · ${r.removed} removed${r.warnings.length ? ` · ${r.warnings.length} warning(s)` : ""}` }),
        onError: (e) => toast({ kind: "error", text: e.message }),
      },
    );
  };

  const nextTheme: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <aside className={cx("flex shrink-0 flex-col border-r border-line bg-surface transition-[width] duration-200", collapsed ? "w-14" : "w-[232px]")}>
      <div className="flex h-12 items-center gap-2 border-b border-line px-3">
        {!collapsed && (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="grid size-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-accent-fg">KC</div>
            <span className="truncate text-[13px] font-semibold">KanbanClass</span>
          </div>
        )}
        <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggle} className={collapsed ? "mx-auto" : ""}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </IconButton>
      </div>

      <nav className="flex flex-col gap-0.5 p-2">
        {NAV.map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            onClick={() => nav.go(view)}
            title={collapsed ? label : undefined}
            aria-current={nav.view === view ? "page" : undefined}
            className={cx(
              "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors",
              nav.view === view ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
              collapsed && "justify-center",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!collapsed && label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!collapsed && <div className="px-2 pt-3 pb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Subjects</div>}
        {subjects?.map((s) => (
          <div key={s.id} className={cx("group flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover", collapsed && "justify-center")} title={collapsed ? s.name : undefined}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color, opacity: s.isVisible ? 1 : 0.35 }} />
            {!collapsed && (
              <>
                <button className={cx("min-w-0 flex-1 truncate text-left text-[13px]", s.isVisible ? "text-fg" : "text-faint")} onClick={() => nav.go("board", { subjectId: s.id })}>
                  {s.name}
                </button>
                <span className="text-[11px] text-faint tabular-nums">
                  {s.stats.completed}/{s.stats.totalSlots}
                </span>
                <IconButton
                  label={s.isVisible ? `Hide ${s.name} column` : `Show ${s.name} column`}
                  className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => updateSubject.mutate({ id: s.id, isVisible: !s.isVisible })}
                >
                  {s.isVisible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </IconButton>
              </>
            )}
          </div>
        ))}
        {!collapsed && subjects?.length === 0 && <div className="px-2 py-1 text-xs text-faint">Subjects appear after your first calendar sync.</div>}
      </div>

      <div className={cx("flex items-center gap-1 border-t border-line p-2", collapsed && "flex-col")}>
        {!collapsed && (
          <div className="min-w-0 flex-1 px-1 text-[11px] leading-tight text-faint">
            {settings?.lastSyncAt ? (
              <>
                Synced {relativeDays(settings.lastSyncAt) === "today" ? fmtTime(settings.lastSyncAt) : relativeDays(settings.lastSyncAt)}
                <br />
                {settings.aiEnabled ? "AI parsing on" : "Heuristic parsing"}
              </>
            ) : (
              "Not synced yet"
            )}
          </div>
        )}
        <IconButton label="Sync calendar" onClick={runSync} disabled={sync.isPending}>
          <RefreshCw className={cx("size-4", sync.isPending && "animate-spin")} />
        </IconButton>
        <IconButton label={`Theme: ${theme} (click for ${nextTheme[theme]})`} onClick={() => setTheme(nextTheme[theme])}>
          <ThemeIcon className="size-4" />
        </IconButton>
      </div>
    </aside>
  );
}
