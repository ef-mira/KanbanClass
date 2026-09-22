/**
 * Generates a realistic weekly Danish timetable as iCal for first-run demos,
 * shaped like a Zenbi export: one recurring VEVENT per weekly slot, with
 * lessons, breaks, a staff meeting and yard duty mixed together.
 */
const WEEK: { day: number; start: string; end: string; summary: string; location: string }[] = [
  { day: 1, start: "08:00", end: "09:30", summary: "Fysik 10 - 10.A", location: "Fysiklab" },
  { day: 1, start: "09:30", end: "09:50", summary: "Pause", location: "" },
  { day: 1, start: "09:50", end: "11:20", summary: "Matematik 10A - 10.A", location: "Lok. 14" },
  { day: 1, start: "11:20", end: "11:50", summary: "Frokost", location: "" },
  { day: 2, start: "08:00", end: "09:30", summary: "Kemi 9B - 9.B", location: "Kemilab" },
  { day: 2, start: "09:30", end: "09:50", summary: "Gårdvagt", location: "Skolegården" },
  { day: 2, start: "10:00", end: "10:45", summary: "Matematik 10A - 10.A", location: "Lok. 14" },
  { day: 3, start: "08:00", end: "08:45", summary: "Fysik 10 - 10.A", location: "Fysiklab" },
  { day: 3, start: "09:50", end: "11:20", summary: "Kemi 9B - 9.B", location: "Kemilab" },
  { day: 3, start: "14:00", end: "15:30", summary: "Lærermøde", location: "Personalerummet" },
  { day: 4, start: "08:00", end: "09:30", summary: "Matematik 10A - 10.A", location: "Lok. 14" },
  { day: 4, start: "09:30", end: "09:50", summary: "Pause", location: "" },
  { day: 4, start: "12:15", end: "13:45", summary: "Fysik 10 - 10.A", location: "Fysiklab" },
  { day: 5, start: "08:00", end: "08:45", summary: "Kemi 9B - 9.B", location: "Kemilab" },
  { day: 5, start: "08:50", end: "09:35", summary: "Teammøde 10. årgang", location: "Lok. 3" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const localStamp = (d: Date, hhmm: string) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${hhmm.replace(":", "")}00`;

export function buildSampleIcs(from: Date, to: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KanbanClass//Sample//DA", "CALSCALE:GREGORIAN"];
  // First Monday on/after the window start.
  const monday = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
  const until = `${to.getFullYear()}${pad(to.getMonth() + 1)}${pad(to.getDate())}T235900`;
  // Autumn break: week 42 (mid-October).
  const autumn = new Date(monday.getFullYear(), 9, 12);
  while (autumn.getDay() !== 1) autumn.setDate(autumn.getDate() + 1);

  WEEK.forEach((slot, i) => {
    const first = new Date(monday);
    first.setDate(monday.getDate() + slot.day - 1);
    const breakDay = new Date(autumn);
    breakDay.setDate(autumn.getDate() + slot.day - 1);
    lines.push(
      "BEGIN:VEVENT",
      `UID:sample-${i}@kanbanclass`,
      `DTSTAMP:${localStamp(new Date(), "00:00")}Z`,
      `DTSTART:${localStamp(first, slot.start)}`,
      `DTEND:${localStamp(first, slot.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${until}`,
      `EXDATE:${localStamp(breakDay, slot.start)}`,
      `SUMMARY:${slot.summary}`,
      ...(slot.location ? [`LOCATION:${slot.location}`] : []),
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
