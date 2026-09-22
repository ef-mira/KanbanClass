import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MODEL, describeAIError, getClient } from "./client";
import { heuristicActionItems } from "./heuristics";

export interface ActionItem {
  title: string;
  /** YYYY-MM-DD, or null to use the default lead time before the lesson. */
  dueDate: string | null;
}

const ActionItems = z.object({
  items: z.array(z.object({ title: z.string(), dueDate: z.string().nullable() })),
});

const SYSTEM_PROMPT = `You read a teacher's lesson notes (Markdown, often Danish or English) and extract operational to-dos the TEACHER must do before the lesson: ordering or buying materials, printing or copying, booking rooms/transport/equipment, emailing parents or colleagues, preparing equipment.

Do NOT include: lesson activities the students do, learning goals, content to teach, homework for students, or things already marked done ("- [x]").

Write each title as a short imperative in the notes' language, e.g. "Order copper sulfate", "Bestil bus til ekskursion". If the notes state or imply a deadline, give dueDate as YYYY-MM-DD relative to the lesson date provided; otherwise null. Return an empty list if there is nothing to do.`;

export async function extractActionItems(
  body: string,
  context: { lessonTitle: string; subjectName: string; lessonDate: Date | null; today: Date },
): Promise<{ items: ActionItem[]; source: "ai" | "heuristic"; warning?: string }> {
  if (!body.trim()) return { items: [], source: "heuristic" };
  const client = getClient();
  if (client) {
    try {
      const response = await client.messages.parse({
        model: AI_MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Subject: ${context.subjectName}\nLesson: ${context.lessonTitle}\nLesson date: ${context.lessonDate ? context.lessonDate.toISOString().slice(0, 10) : "unscheduled"}\nToday: ${context.today.toISOString().slice(0, 10)}\n\n<notes>\n${body}\n</notes>`,
          },
        ],
        output_config: { format: zodOutputFormat(ActionItems) },
      });
      if (response.parsed_output) {
        return {
          items: response.parsed_output.items
            .map((i) => ({ title: i.title.trim(), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate ?? "") ? i.dueDate : null }))
            .filter((i) => i.title),
          source: "ai",
        };
      }
    } catch (err) {
      return { items: toItems(heuristicActionItems(body)), source: "heuristic", warning: describeAIError(err) };
    }
  }
  return { items: toItems(heuristicActionItems(body)), source: "heuristic" };
}

function toItems(titles: string[]): ActionItem[] {
  return titles.map((title) => ({ title, dueDate: null }));
}
