const LOCALE = "en-GB";

export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
export const fmtDate = (iso: string | Date) => new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
export const fmtSlot = (start: string, end: string) => `${fmtDay(start)} · ${fmtTime(start)}–${fmtTime(end)}`;

/** Local YYYY-MM-DD (not UTC). */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** ISO-8601 week number ("Uge 41"). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function relativeDays(iso: string): string {
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d = new Date(iso);
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const n = Math.round((b - a) / 86_400_000);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** Tint + readable text for an arbitrary subject hex color. */
export function subjectTint(hex: string, dark: boolean) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const bg = `rgb(${r} ${g} ${b} / ${dark ? 0.18 : 0.12})`;
  // Darken (light theme) or lighten (dark theme) the hue for text contrast on the tint.
  const mix = (c: number) => (dark ? Math.round(c + (255 - c) * 0.55) : Math.round(c * 0.55));
  return { bg, fg: `rgb(${mix(r)} ${mix(g)} ${mix(b)})`, solid: hex };
}
