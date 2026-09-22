import { createHash } from "node:crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "../../db";
import { EVENT_TYPES, type EventType } from "../../../shared/types";
import { AI_MODEL, describeAIError, getClient } from "./client";
import { heuristicParse } from "./heuristics";

export interface RawEventText {
  summary: string;
  description: string;
  location: string;
}

export interface ParsedEventFields {
  eventType: EventType;
  subject: string | null;
  group: string | null;
  room: string | null;
  isPause: boolean;
}

const BATCH_SIZE = 40;

const ParsedBatch = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      eventType: z.enum(EVENT_TYPES),
      subject: z.string().nullable(),
      group: z.string().nullable(),
      room: z.string().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You parse entries from a Danish school teacher's timetable (iCal export from Zenbi/Lectio-style systems) into structured fields.

For each entry decide:
- eventType: "lesson" for a taught class; "pause" for breaks (pause, frikvarter, frokost); "meeting" for staff/parent/team meetings (møde, pæd. råd, MUS, samtale); "supervision" for duties (gårdvagt, tilsyn, vagt); "other" for anything else (holidays, excursion notices, personal blocks).
- subject: for lessons only, the course name as the teacher would label a column, including the year/class level when it is part of the name, e.g. "Fysik 10", "Matematik 10A", "Kemi 9B". Keep the original language and capitalisation. Use the same string for every entry of the same course so they group together. null for non-lessons.
- group: the class or team code if present (e.g. "10A", "9.b", "hold 2"), else null.
- room: the room code if present (from the location or text, e.g. "Lok. 12" -> "12", "Fysiklab" -> "Fysiklab"), else null.

Return one result per input id, echoing the id exactly.`;

function hashOf(ev: RawEventText): string {
  return createHash("sha256").update(`${ev.summary}\u0000${ev.description}\u0000${ev.location}`).digest("hex");
}

/**
 * Parses event text fields. Dates/times come straight from the iCal data and
 * never go through the model; only summary/description/location are parsed.
 * Identical text (the same weekly lesson) is parsed once and cached.
 */
export async function parseEventTexts(
  events: RawEventText[],
): Promise<{ results: ParsedEventFields[]; aiParsed: number; heuristicParsed: number; warnings: string[] }> {
  const warnings: string[] = [];
  const hashes = events.map(hashOf);
  const unique = new Map<string, RawEventText>();
  hashes.forEach((h, i) => unique.set(h, events[i]));

  const client = getClient();
  const cached = await prisma.eventParseCache.findMany({ where: { hash: { in: [...unique.keys()] } } });
  const byHash = new Map<string, ParsedEventFields>();
  for (const c of cached) {
    // Heuristic results are re-done by the model once an API key is configured.
    if (client && c.source !== "ai") continue;
    byHash.set(c.hash, JSON.parse(c.result));
  }

  const todo = [...unique.entries()].filter(([h]) => !byHash.has(h));
  let aiParsed = 0;
  let heuristicParsed = 0;

  if (client && todo.length) {
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      try {
        const input = batch.map(([, ev], idx) => ({ id: String(idx), summary: ev.summary, description: ev.description.slice(0, 300), location: ev.location }));
        const response = await client.messages.parse({
          model: AI_MODEL,
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(input) }],
          output_config: { format: zodOutputFormat(ParsedBatch) },
        });
        const parsed = response.parsed_output;
        if (!parsed) throw new Error(`model returned no parseable output (stop_reason: ${response.stop_reason})`);
        for (const r of parsed.events) {
          const entry = batch[Number(r.id)];
          if (!entry) continue;
          const fields: ParsedEventFields = {
            eventType: r.eventType,
            subject: r.eventType === "lesson" ? r.subject?.trim() || null : null,
            group: r.group?.trim() || null,
            room: r.room?.trim() || null,
            isPause: r.eventType === "pause",
          };
          byHash.set(entry[0], fields);
          await cache(entry[0], fields, "ai");
          aiParsed++;
        }
      } catch (err) {
        warnings.push(`AI parse failed for ${batch.length} entries, used heuristics instead: ${describeAIError(err)}`);
        break; // fall through to heuristics for everything left
      }
    }
  }

  for (const [h, ev] of unique) {
    if (byHash.has(h)) continue;
    const fields = heuristicParse(ev);
    byHash.set(h, fields);
    await cache(h, fields, "heuristic");
    heuristicParsed++;
  }

  return { results: hashes.map((h) => byHash.get(h)!), aiParsed, heuristicParsed, warnings };
}

async function cache(hash: string, fields: ParsedEventFields, source: "ai" | "heuristic") {
  const result = JSON.stringify(fields);
  await prisma.eventParseCache.upsert({
    where: { hash },
    create: { hash, result, source },
    update: { result, source },
  });
}
