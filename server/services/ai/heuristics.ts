import type { EventType } from "../../../shared/types";
import type { ParsedEventFields, RawEventText } from "./parseEvents";

// Danish + English keywords as seen in school timetable exports.
const PAUSE = /\b(pause|frikvarter|spisepause|frokost(pause)?|break|lunch)\b/i;
const SUPERVISION = /\b(gårdvagt|gaardvagt|tilsyn|vagt|supervision|duty|rastvagt)\b/i;
const MEETING = /\b(møde|moede|meeting|konference|pæd\.?\s*råd|pædagogisk råd|mus|forældremøde|teammøde|lærermøde|samtale)\b/i;
const ROOM = /\b(?:lok(?:ale)?\.?|room|rum)\s*([A-Za-z0-9.\-]+)/i;
const GROUP = /\b(\d{1,2}\s?\.?\s?[a-zA-ZæøåÆØÅ]{1,2})\b/;

export function heuristicParse(ev: RawEventText): ParsedEventFields {
  const text = `${ev.summary} ${ev.description}`;
  let eventType: EventType = "lesson";
  if (PAUSE.test(ev.summary)) eventType = "pause";
  else if (SUPERVISION.test(text)) eventType = "supervision";
  else if (MEETING.test(text)) eventType = "meeting";
  else if (!ev.summary.trim()) eventType = "other";

  const roomMatch = ev.location.trim() || text.match(ROOM)?.[1] || null;
  // Subject is the summary up to the first separator: "Fysik 10 - 10.A - Lok 12" -> "Fysik 10".
  const subject =
    eventType === "lesson" ? ev.summary.split(/\s+[-–|,]\s+|\s*\|\s*/)[0].trim() || null : null;
  const group = eventType === "lesson" ? (ev.summary.match(GROUP)?.[1]?.replace(/\s/g, "") ?? null) : null;

  return {
    eventType,
    subject,
    group,
    room: roomMatch ? String(roomMatch).trim() : null,
    isPause: eventType === "pause",
  };
}

const ACTION_VERBS =
  /\b(order|buy|print|copy|book|email|e-mail|send|prepare|reserve|borrow|bestil|køb|print|kopi[eé]r|book|send|forbered|lån|reservér|husk)\b/i;

/** Fallback action-item extraction: unchecked checklist items and lines starting with a to-do verb. */
export function heuristicActionItems(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const check = line.match(/^[-*+]\s*\[\s\]\s*(.+)$/);
    if (check?.[1]?.trim()) {
      out.push(check[1].trim());
      continue;
    }
    const todo = line.match(/^(?:[-*+]\s*)?(?:todo|to-do|husk)\s*:\s*(.+)$/i);
    if (todo?.[1]) {
      out.push(todo[1].trim());
      continue;
    }
    const bullet = line.replace(/^[-*+]\s*/, "");
    if (/^\w/.test(bullet) && ACTION_VERBS.test(bullet.split(/\s+/).slice(0, 2).join(" ")) && bullet.length < 120) {
      out.push(bullet);
    }
  }
  return [...new Set(out)];
}
