/**
 * Converts the FaithMap question database (markdown) into discover-card seed
 * data. Source: data/sources/shalom_132_question_content_database.md, written
 * by the sholam team (updated 2026-11-14). Output: data/faithmap.cards.json,
 * which `npm run seed:flashcards` loads.
 *
 * Shapes in the source:
 *   ## Section heading
 *   ### FM001 | Question?
 *   *Medium · Real Life, Curious · 3 min*
 *   **Primary Scripture:** Galatians 1:10
 *   **Supporting Scripture:** John 12:42–43, Proverbs 29:25
 *   **Clear answer**               then a paragraph
 *   **Why this passage matters**   then a paragraph
 *   **Key takeaway**               then a line
 *
 * Every entry must have all of these. Card ids come from the question text,
 * so a card keeps its database row when its wording elsewhere changes.
 *
 * Run: npm run faithmap:convert
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseReference } from "../src/lib/bible/refs";
import {
  type DiscoverCardSeed,
  discoverCardSchema,
} from "../src/lib/flashcards/types";

const SOURCE = "data/sources/shalom_132_question_content_database.md";
const OUT = "data/faithmap.cards.json";
const SOURCE_TAG = "faithmap-132";

const SECTION_CATEGORY: Record<string, DiscoverCardSeed["category"]> = {
  "Everyday Life, Social Media & Identity": "life-identity",
  "Jesus: The Unexpected Details": "jesus-details",
  "Strange & Surprising Bible Stories": "surprising-stories",
  "Life in Jesus' Time": "jesus-times",
  "Big Questions About God & Faith": "big-questions",
  "Faith & the Modern World": "modern-world",
  "Science, History & the Bible": "science-history",
  "Prayer, Purpose & the Christian Life": "prayer-purpose",
  "Wait, That's in the Bible?": "wait-really",
};

const PROSE_FIELDS = {
  "Clear answer": "answer",
  "Why this passage matters": "explanation",
  "Key takeaway": "takeaway",
} as const;
type ProseField = (typeof PROSE_FIELDS)[keyof typeof PROSE_FIELDS];

const LEVELS: Record<string, number> = { easy: 1, medium: 2, deep: 3 };

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");
}

interface Draft {
  id: string;
  ref: string;
  line: number;
  card: Partial<DiscoverCardSeed> & { question: string };
  primary?: string;
  supporting?: string;
  prose: Partial<Record<ProseField, string[]>>;
}

/** Lines of a field → paragraphs joined by a blank line, wrapped lines by a space. */
function paragraphs(lines: string[]): string {
  return lines
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").join(" ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function convert(markdown: string) {
  const drafts: Draft[] = [];
  let section = "";
  let current: Draft | null = null;
  let field: ProseField | null = null;

  markdown.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const lineNo = i + 1;
    const sectionMatch = /^## (.+)$/.exec(line);
    const entryMatch = /^### (FM\d{3}) \| (.+)$/.exec(line);
    const metaMatch = /^\*(?!\*)(.+)\*$/.exec(line);
    const refsMatch = /^\*\*(Primary|Supporting) Scripture:\*\*\s*(.+)$/.exec(
      line,
    );
    const proseMatch = /^\*\*(.+)\*\*$/.exec(line);

    if (sectionMatch) {
      section = sectionMatch[1].trim();
      current = null;
      field = null;
    } else if (line.startsWith("### ")) {
      if (!entryMatch)
        throw new Error(`line ${lineNo}: expected "### FM000 | Question"`);
      const category = SECTION_CATEGORY[section];
      if (!category)
        throw new Error(`line ${lineNo}: unknown section "${section}"`);
      const question = entryMatch[2].trim();
      current = {
        id: `faithmap-${slug(question)}`,
        ref: entryMatch[1],
        line: lineNo,
        card: {
          kind: "discover",
          question,
          category,
          section,
          tags: [],
          source: SOURCE_TAG,
        },
        prose: {},
      };
      field = null;
      drafts.push(current);
    } else if (!current) {
      // Front matter and editorial notes before the first entry.
    } else if (refsMatch) {
      field = null;
      if (refsMatch[1] === "Primary") current.primary = refsMatch[2];
      else current.supporting = refsMatch[2];
    } else if (proseMatch && proseMatch[1] in PROSE_FIELDS) {
      field = PROSE_FIELDS[proseMatch[1] as keyof typeof PROSE_FIELDS];
      current.prose[field] = [];
    } else if (proseMatch) {
      throw new Error(`line ${lineNo}: unknown label "${proseMatch[1]}"`);
    } else if (metaMatch && !field) {
      // "Medium · Real Life, Curious · 3 min"
      const [level, tags, time] = metaMatch[1].split("·").map((s) => s.trim());
      const difficulty = LEVELS[level?.toLowerCase() ?? ""];
      if (!difficulty)
        throw new Error(`line ${lineNo}: unknown level "${level}"`);
      current.card.difficulty = difficulty;
      current.card.tags = (tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const minutes = /^(\d+)\s*min$/.exec(time ?? "");
      if (minutes) current.card.minutes = Number(minutes[1]);
    } else if (field) {
      current.prose[field]?.push(line);
    } else if (line.trim()) {
      throw new Error(`line ${lineNo}: text outside a labelled field`);
    }
  });

  // A few questions appear twice (a second write-up in a later section).
  // One card per question: keep the first, report the repeat.
  const seen = new Map<string, Draft>();
  const skipped: string[] = [];
  const cards = [];
  for (const draft of drafts) {
    const { id, card, line, ref } = draft;
    const first = seen.get(id);
    if (first) {
      skipped.push(
        `${ref} (line ${line}) repeats ${first.ref}: ${card.question}`,
      );
      continue;
    }
    seen.set(id, draft);
    if (!draft.primary)
      throw new Error(`${ref} (line ${line}): no Primary Scripture`);
    const refs = [
      ...parseReference(draft.primary),
      ...(draft.supporting ? parseReference(draft.supporting) : []),
    ];
    for (const name of Object.values(PROSE_FIELDS)) {
      const text = paragraphs(draft.prose[name] ?? []);
      if (!text) throw new Error(`${ref} (line ${line}): no ${name}`);
      card[name] = text;
    }
    const parsed = discoverCardSchema.safeParse({
      ...card,
      refs: [...new Set(refs)],
    });
    if (!parsed.success) {
      throw new Error(
        `${ref} (line ${line}, "${card.question}"): ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`,
      );
    }
    cards.push({ id, ...parsed.data });
  }
  return { cards, entries: drafts.length, skipped };
}

const { cards, entries, skipped } = convert(readFileSync(SOURCE, "utf8"));
writeFileSync(OUT, `${JSON.stringify(cards, null, 2)}\n`);
const bySection = new Map<string, number>();
for (const c of cards)
  bySection.set(c.category, (bySection.get(c.category) ?? 0) + 1);
console.log(
  `${entries} entries, ${skipped.length} repeats skipped → ${cards.length} discover cards in ${OUT}`,
);
for (const s of skipped) console.log(`  skipped ${s}`);
for (const [category, n] of bySection) console.log(`  ${category}: ${n}`);
