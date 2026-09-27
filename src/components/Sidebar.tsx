import { useState } from "react";
import { Calendar, Eye, EyeOff, LayoutDashboard, Moon, PanelLeft, RefreshCw, SquareKanban, Sun } from "lucide-react";
import { useSettings, useSubjects, useSync, useUpdateSubject } from "../api";
import { useNav, type View } from "../nav";
import { useIsDark, useThemePref, type ThemePref } from "../lib/theme";
import { time } from "../ui/format";
import { cx } from "../ui/format";
import { useToast } from "./toast";

const NAV: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "board", label: "Subjects board", icon: SquareKanban },
  { view: "settings", label: "Calendar & settings", icon: Calendar },
];

export function Sidebar() {
  const nav = useNav();
  const { data: subjects } = useSubjects();
  const { data: settings } = useSettings();
  const updateSubject = useUpdateSubject();
  const sync = useSync();
  const toast = useToast();
  const [theme, setTheme] = useThemePref();
  const dark = useIsDark();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("sidebar") === "collapsed";
    } catch {
      return false;
    }
  });

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar", c ? "open" : "collapsed");
      } catch {
        /* ignore */
      }
      return !c;
    });

  const runSync = () => {
    if (!settings?.icalUrl) {
      nav.go("settings");
      toast({ kind: "info", text: "Add your calendar feed URL to sync, or load the sample timetable." });
      return;
    }
    sync.mutate(
      { kind: "feed" },
      {
        onSuccess: (r) => toast({ kind: "success", text: `Synced ${r.fetched} events · ${r.created} new · ${r.removed} removed` }),
        onError: (e) => toast({ kind: "error", text: e.message }),
      },
    );
  };

  const nextTheme: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
  const iconBtn = "grid size-7 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text";

  return (
    <aside className={cx("flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200", collapsed ? "w-14" : "w-[232px]")}>
      <div className="flex h-12 items-center gap-2 px-3">
        <div className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-[10.5px] font-bold text-accent-fg">KC</div>
        {!collapsed && <span className="flex-1 truncate text-[13.5px] font-semibold">KanbanClass</span>}
        <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className={cx(iconBtn, "size-[26px]", collapsed && "hidden")}>
          <PanelLeft size={15} />
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1.5">
        {NAV.map(({ view, label, icon: Icon }) => {
          const active = nav.view === view;
          return (
            <button
              key={view}
              type="button"
              onClick={() => nav.go(view)}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-[13px] transition-colors",
                active ? "bg-surface-raised font-medium text-text shadow-[0_0_0_1px_var(--border)]" : "text-text-muted hover:bg-surface-hover hover:text-text",
                collapsed && "justify-center",
              )}
            >
              <Icon size={16} className={active ? "text-accent" : undefined} />
              {!collapsed && label}
            </button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {!collapsed && <div className="px-2 pt-[18px] pb-1.5 text-[11px] font-medium text-text-faint">Subjects</div>}
        {subjects?.map((s) => (
          <div
            key={s.id}
            className={cx("group flex h-[30px] items-center gap-2 rounded-md px-2 hover:bg-surface-hover", collapsed && "justify-center")}
            title={collapsed ? s.name : undefined}
          >
            <span className="size-2 shrink-0 rounded-full" style={{ background: s.color, opacity: s.isVisible ? 1 : 0.35 }} />
            {!collapsed && (
              <>
                <button type="button" className={cx("min-w-0 flex-1 truncate text-left text-[13px]", s.isVisible ? "text-text" : "text-text-faint")} onClick={() => nav.go("board", { subjectId: s.id })}>
                  {s.name}
                </button>
                <button
                  type="button"
                  aria-label={s.isVisible ? `Hide ${s.name}` : `Show ${s.name}`}
                  onClick={() => updateSubject.mutate({ id: s.id, isVisible: !s.isVisible })}
                  className="text-text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-text focus-visible:opacity-100"
                >
                  {s.isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <span className="text-[11px] text-text-faint tabular-nums">
                  {s.stats.completed}/{s.stats.totalSlots}
                </span>
              </>
            )}
          </div>
        ))}
        {!collapsed && subjects?.length === 0 && <p className="px-2 py-1 text-[12px] text-text-faint">Subjects appear after your first calendar sync.</p>}
      </div>

      <div className={cx("flex items-center gap-1.5 border-t border-border p-2.5", collapsed && "flex-col")}>
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-text-muted">
            <span className={cx("size-1.5 shrink-0 rounded-full", settings?.lastSyncAt ? "bg-success" : "bg-text-faint")} />
            <span className="truncate">{settings?.lastSyncAt ? `Synced ${time(settings.lastSyncAt)}` : "Not synced"}</span>
          </span>
        )}
        <button type="button" onClick={runSync} disabled={sync.isPending} aria-label="Sync calendar" className={iconBtn}>
          <RefreshCw size={14} className={sync.isPending ? "animate-spin" : undefined} />
        </button>
        <button type="button" onClick={() => setTheme(nextTheme[theme])} aria-label={`Theme: ${theme}. Switch to ${nextTheme[theme]}.`} className={iconBtn}>
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </aside>
  );
}
