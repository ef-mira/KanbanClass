import Anthropic from "@anthropic-ai/sdk";

/** Fast, cheap model for administrative parsing. Claude 3.5 Haiku is retired; Haiku 4.5 replaces it. */
export const AI_MODEL = process.env.AI_MODEL || "claude-haiku-4-5";

let client: Anthropic | null = null;

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClient(): Anthropic | null {
  if (!aiEnabled()) return null;
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  return client;
}

export function describeAIError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API key was rejected";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit hit";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API";
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status ?? ""}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
