import { cx, tint } from "./format";

export interface SubjectPillProps {
  name: string;
  color: string;
  /** "header": uppercase column pill. "tag": small sentence-case tag used on cards in By day. */
  variant?: "header" | "tag";
  className?: string;
}

/** Subject colour appears only as a 15% tint and a dot; the label stays in --text for contrast. */
export function SubjectPill({ name, color, variant = "header", className }: SubjectPillProps) {
  return (
    <span
      className={cx(
        "inline-flex min-w-0 items-center rounded-full font-semibold text-text whitespace-nowrap",
        variant === "header" ? "h-[22px] gap-1.5 px-[9px] text-[11px] uppercase tracking-[.04em]" : "h-5 gap-[5px] px-2 text-[11px]",
        className
      )}
      style={{ background: tint(color, 0.15) }}
    >
      <span className={cx("shrink-0 rounded-full", variant === "header" ? "size-[7px]" : "size-1.5")} style={{ background: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function SubjectDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}
