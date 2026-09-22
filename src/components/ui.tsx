import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CalendarOff, CheckCircle2, Circle, CircleDashed, Loader2, X } from "lucide-react";
import type { LessonStatus } from "../../shared/types";
import { subjectTint } from "../lib/format";
import { useIsDark } from "../lib/theme";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-90",
        variant === "secondary" && "border border-line bg-raised text-fg hover:bg-hover hover:border-line-strong",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "border border-line bg-raised text-danger hover:bg-hover",
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx("inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40", className)}
    >
      {children}
    </button>
  );
}

export function SubjectTag({ name, color, size = "sm" }: { name: string; color: string; size?: "sm" | "md" }) {
  const t = subjectTint(color, useIsDark());
  return (
    <span
      className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full font-medium", size === "sm" ? "h-[18px] px-2 text-[11px]" : "h-[22px] px-2.5 text-xs")}
      style={{ background: t.bg, color: t.fg }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: t.solid }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function ToggleChip({ pressed, onClick, children, count, icon }: { pressed: boolean; onClick: () => void; children: ReactNode; count?: number; icon?: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150",
        pressed ? "border-accent/50 bg-accent-soft text-fg" : "border-line text-faint hover:text-muted hover:border-line-strong",
      )}
    >
      {icon}
      {children}
      {count !== undefined && <span className={cx("tabular-nums", pressed ? "text-muted" : "text-faint")}>{count}</span>}
    </button>
  );
}

const STATUS: Record<LessonStatus, { label: string; icon: typeof Circle; cls: string }> = {
  done: { label: "Done", icon: CheckCircle2, cls: "text-success bg-success/10" },
  planned: { label: "Planned", icon: Circle, cls: "text-accent border border-accent/40" },
  "needs-plan": { label: "Needs plan", icon: AlertTriangle, cls: "text-warning bg-warning/12 font-semibold" },
  unplanned: { label: "Unplanned", icon: CircleDashed, cls: "text-faint border border-dashed border-line-strong" },
  "no-slot": { label: "Unscheduled", icon: CalendarOff, cls: "text-faint bg-hover" },
};

export function StatusBadge({ status, compact }: { status: LessonStatus; compact?: boolean }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cx("inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 text-[11px] leading-none", s.cls)} title={compact ? s.label : undefined}>
      <Icon className="size-3" aria-hidden />
      {compact ? <span className="sr-only">{s.label}</span> : s.label}
    </span>
  );
}

export function ProgressBar({ segments, total, thin, label }: { segments: { value: number; color: string; label?: string }[]; total: number; thin?: boolean; label?: string }) {
  return (
    <div>
      <div
        className={cx("flex w-full overflow-hidden rounded-full bg-hover", thin ? "h-1" : "h-2")}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={segments[0]?.value ?? 0}
        aria-label={label}
      >
        {segments.map((s, i) => (
          <div key={i} title={s.label} className="h-full transition-[width] duration-300" style={{ width: `${total ? (s.value / total) * 100 : 0}%`, background: s.color }} />
        ))}
      </div>
      {label && !thin && <div className="mt-1 text-[11px] text-faint">{label}</div>}
    </div>
  );
}

/** Right-hand slide-over (or centered modal) with scrim, Esc to close, and focus kept inside while open. */
export function Drawer({
  open,
  onClose,
  width = 560,
  children,
  label,
  placement = "right",
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  label: string;
  placement?: "right" | "center";
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost drawer reacts when two are stacked (day view -> lesson).
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const [first, last] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
        else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={cx("fixed inset-0 z-40 flex", placement === "center" ? "items-center justify-center p-6" : "justify-end")}>
      <div className="animate-fade absolute inset-0 bg-[var(--scrim)]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cx(
          "relative flex w-full flex-col bg-surface shadow-float outline-none",
          placement === "center" ? "animate-fade h-full max-h-[860px] rounded-xl border border-line" : "animate-drawer h-full border-l border-line",
        )}
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  );
}

export function DrawerClose({ onClose }: { onClose: () => void }) {
  return (
    <IconButton label="Close (Esc)" onClick={onClose}>
      <X className="size-4" />
    </IconButton>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="text-[13px] font-medium text-muted">{title}</div>
      {children && <div className="max-w-sm text-xs text-faint">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-hover", className)} />;
}
