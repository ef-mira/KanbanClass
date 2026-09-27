const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

// The API sends UTC timestamps; everything below renders them in local time.
const pad = (n: number) => String(n).padStart(2, "0");

/** "Wed 23/9 · 08:00" */
export const shortDateTime = (iso: string | Date) => {
  const d = new Date(iso);
  return `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "Wed 23 Sept" */
export const longDate = (iso: string | Date) => {
  const d = new Date(iso);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};
/** "23/9" */
export const shortDate = (iso: string | Date) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
};
export const time = (iso: string | Date) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** "Sun 20/9" — the day `offsetDays` before `iso` */
export const dayBefore = (iso: string | Date, offsetDays: number) => {
  const d = new Date(iso);
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offsetDays);
  return `${DOW[x.getDay()]} ${x.getDate()}/${x.getMonth() + 1}`;
};
/** "in 6 days", "today", "2 days ago" */
export function relativeDays(iso: string | Date): string {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const d = new Date(iso);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((b - a) / 86_400_000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export type MdBlock =
  | { type: "h"; text: string }
  | { type: "li"; text: string }
  | { type: "task"; text: string; checked: boolean }
  | { type: "p"; text: string };

export function parseMarkdown(md: string): MdBlock[] {
  return md
    .split("\n")
    .filter((s) => s.trim())
    .map((s): MdBlock => {
      let m: RegExpMatchArray | null;
      if ((m = s.match(/^#{1,6}\s+(.*)/))) return { type: "h", text: m[1] };
      if ((m = s.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)/i))) return { type: "task", text: m[2], checked: m[1].toLowerCase() === "x" };
      if ((m = s.match(/^\s*[-*]\s+(.*)/))) return { type: "li", text: m[1] };
      return { type: "p", text: s };
    });
}

/** Plain-text preview lines: headings dropped unless they're all there is; bullets as •, checkboxes as ☐. */
export function previewLines(md: string): string[] {
  const blocks = parseMarkdown(md);
  const body = blocks.filter((b) => b.type !== "h");
  return (body.length ? body : blocks).map((b) => {
    const t = b.text.replace(/\*\*|__|\*|_/g, "");
    if (b.type === "li") return "• " + t;
    if (b.type === "task") return (b.checked ? "☑ " : "☐ ") + t;
    return t;
  });
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Subject colour at an alpha, e.g. tint("#3b82f6", 0.15) */
export const tint = (hex: string, a: number) =>
  hex +
  Math.round(a * 255)
    .toString(16)
    .padStart(2, "0");

export const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

/** Local "YYYY-MM-DDTHH:mm" — WeekGrid compares these as plain strings. */
export const localIso = (iso: string | Date) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
