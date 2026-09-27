import { Fragment, type ReactNode } from "react";
import { parseMarkdown } from "./format";

/** Inline **bold**, *italic*, [link](url). Deliberately small; swap for the app's renderer if it has one. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("**")) out.push(<strong key={k++} className="font-semibold text-text">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(<a key={k++} href={href} className="text-accent underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{label}</a>);
    } else out.push(<em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Read-only rendered Markdown for expanded cards. */
export function Markdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="flex flex-col gap-0.5 text-[13px] leading-[1.5] text-text-muted">
      {blocks.map((b, i) => (
        <Fragment key={i}>
          {b.type === "h" && <div className={"font-semibold text-text" + (i ? " pt-1.5" : "")}>{inline(b.text)}</div>}
          {b.type === "li" && (
            <div className="flex gap-[7px]"><span className="text-text-faint">•</span><span>{inline(b.text)}</span></div>
          )}
          {b.type === "task" && (
            <div className="flex items-start gap-[7px]">
              <span
                className={
                  "mt-[3px] grid size-[13px] shrink-0 place-items-center rounded-[3px] " +
                  (b.checked ? "bg-accent text-white" : "border-[1.5px] border-border-strong")
                }
              >
                {b.checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
              </span>
              <span className={b.checked ? "line-through" : ""}>{inline(b.text)}</span>
            </div>
          )}
          {b.type === "p" && <div>{inline(b.text)}</div>}
        </Fragment>
      ))}
    </div>
  );
}
