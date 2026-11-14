import { z } from "zod";
import type { OpenAiTool } from "@/lib/agent/openai-types";
import { lookupVerses } from "./lookup-verses";
import { proposeFlashcard } from "./propose-flashcard";
import { searchBible } from "./search-bible";
import { searchFlashcards } from "./search-flashcards";
import type { SholamTool } from "./types";

/** Order matters for prompt caching: keep it fixed. */
export const TOOLS: readonly SholamTool[] = [
  searchFlashcards,
  lookupVerses,
  searchBible,
  proposeFlashcard,
];

export function toolByName(name: string): SholamTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** OpenAI-compatible tool definitions generated from the zod schemas. */
export function toolDefinitions(): OpenAiTool[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toParameters(tool.inputSchema),
    },
  }));
}

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, {
    io: "input",
  }) as Record<string, unknown>;
  return { ...json, type: "object" };
}
