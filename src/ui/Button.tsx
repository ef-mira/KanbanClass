import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./format";

type Variant = "primary" | "secondary" | "ghost" | "soft" | "danger-ghost";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Shown as a tooltip; use for disabled-with-reason ("Coming later") */
  hint?: string;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg font-semibold hover:brightness-110",
  secondary: "bg-surface-raised text-text shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-surface-hover",
  ghost: "text-text-muted hover:bg-surface-hover hover:text-text",
  soft: "bg-accent-soft text-accent font-semibold hover:brightness-95",
  "danger-ghost": "text-text-faint hover:bg-surface-hover hover:text-danger",
};
const sizes: Record<Size, string> = {
  sm: "h-[26px] px-2.5 text-[12px] gap-1.5 rounded-md",
  md: "h-[30px] px-3 text-[12.5px] gap-1.5 rounded-[7px]",
  icon: "size-7 justify-center rounded-md",
};

export function Button({ variant = "secondary", size = "md", icon, hint, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <span className="relative inline-flex group" title={hint}>
      <button
        {...rest}
        disabled={disabled}
        className={cx(
          "inline-flex items-center font-medium whitespace-nowrap transition-colors outline-none",
          "focus-visible:ring-[3px] focus-visible:ring-focus-ring",
          "disabled:cursor-not-allowed disabled:opacity-100 disabled:text-text-faint disabled:bg-transparent disabled:shadow-[inset_0_0_0_1px_var(--border)]",
          variants[variant],
          sizes[size],
          className
        )}
      >
        {icon}
        {children}
      </button>
      {hint && disabled && (
        <span className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-text px-2 py-1 text-[11px] font-medium text-bg opacity-0 group-hover:opacity-100">
          {hint}
        </span>
      )}
    </span>
  );
}
