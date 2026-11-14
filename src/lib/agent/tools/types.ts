import type { z } from "zod";
import type { AgentEvent, VerseRecord } from "@/lib/agent/events";

export interface ToolContext {
  /** null when signed out or auth is not configured yet */
  userId: string | null;
  translation: string;
  /** Pushes a UI event (verse chips, flashcard results, proposals) to the stream. */
  emit: (event: AgentEvent) => void;
  /** Verses fetched this turn, keyed by verse id; the citation check reads it. */
  versesSeen: Map<string, VerseRecord>;
  /** Aborts when the client stops the turn; pass it to every fetch. */
  signal?: AbortSignal;
}

export interface SholamTool<Schema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: Schema;
  /** Returns the tool_result text the model sees. Throw to report an error. */
  run: (input: z.infer<Schema>, ctx: ToolContext) => Promise<string>;
}

export function defineTool<Schema extends z.ZodType>(
  tool: SholamTool<Schema>,
): SholamTool<Schema> {
  return tool;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet (see docs/PLAN.md)`);
  }
}
