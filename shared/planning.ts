import { LESSON_TEMPLATES } from "./templates";

/** Untitled lessons are labelled by their current position, so the label follows reordering. */
export function lessonLabel(l: { title: string; sequenceOrder: number }): string {
  return l.title.trim() || `Lesson ${l.sequenceOrder + 1}`;
}

const TEMPLATE_LINES = new Set(
  Object.values(LESSON_TEMPLATES).flatMap((t) => t.body.split("\n").map((l) => l.trim())),
);

/**
 * A lesson counts as planned once its notes contain something the teacher
 * wrote. Headings, untouched template lines and empty bullets don't count,
 * so inserting a template alone doesn't silence the "unplanned" alert.
 */
export function hasMeaningfulContent(body: string): boolean {
  return body.split("\n").some((raw) => {
    const line = raw.trim();
    if (!line || TEMPLATE_LINES.has(line)) return false;
    if (/^#{1,6}\s/.test(line)) return false;
    if (/^[-*+]\s*(\[[ xX]?\]\s*)?$/.test(line)) return false;
    if (/^[-*+]\s*(\[[ xX]?\]\s*)?[^:]{1,40}:\s*$/.test(line)) return false; // "- Goal:" left blank
    return true;
  });
}
