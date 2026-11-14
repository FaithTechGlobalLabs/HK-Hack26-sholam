import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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

/** Anthropic tool definitions generated from the zod schemas. */
export function toolDefinitions(): Anthropic.Tool[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: toInputSchema(tool.inputSchema),
  }));
}

function toInputSchema(schema: z.ZodType): Anthropic.Tool.InputSchema {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema, {
    io: "input",
  }) as Record<string, unknown>;
  return { ...json, type: "object" };
}
