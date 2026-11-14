/**
 * Converts the FaithMap question list (markdown) into discover-card seed
 * data. Source: data/sources/faithmap_132_curated_questions.md, provided by
 * the sholam team on 2026-11-14. Output: data/faithmap.cards.json, which
 * `npm run seed:flashcards` loads.
 *
 * Shapes in the source:
 *   ## Section heading            (optionally "### Subsection")
 *   - **Question?**
 *     - *Medium · Real Life, Curious · 3 min*      (optional)
 *     - Scripture starting points: Galatians 1:10, John 12:42–43
 *     - Scripture: John 12:1–8; Mark 14:3–9          (alternate label)
 *
 * Run: npm run faithmap:convert
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parseReference } from "../src/lib/bible/refs";
import {
  type DiscoverCardSeed,
  discoverCardSchema,
} from "../src/lib/flashcards/types";

const SOURCE = "data/sources/faithmap_132_curated_questions.md";
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
  card: Partial<DiscoverCardSeed> & { question: string };
  line: number;
}

function convert(markdown: string) {
  const drafts: Draft[] = [];
  let section = "";
  let subsection = "";
  let current: Draft | null = null;

  markdown.split("\n").forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    const lineNo = i + 1;
    const sectionMatch = /^## (.+)$/.exec(line);
    const subsectionMatch = /^### (.+)$/.exec(line);
    const questionMatch = /^- \*\*(.+?)\*\*\s*$/.exec(line);
    const metaMatch = /^\s+- \*(.+)\*$/.exec(line);
    const refsMatch = /^\s+- Scripture(?: starting points)?:\s*(.+)$/.exec(
      line,
    );

    if (sectionMatch) {
      section = sectionMatch[1].replace(/\s*\(\d+ questions\)$/, "").trim();
      subsection = "";
      current = null;
    } else if (subsectionMatch) {
      subsection = subsectionMatch[1].trim();
      current = null;
    } else if (questionMatch) {
      const category = SECTION_CATEGORY[section];
      if (!category)
        throw new Error(`line ${lineNo}: unknown section "${section}"`);
      const question = questionMatch[1].trim();
      current = {
        id: `faithmap-${slug(question)}`,
        line: lineNo,
        card: {
          kind: "discover",
          question,
          category,
          section: subsection ? `${section}: ${subsection}` : section,
          tags: [],
          source: SOURCE_TAG,
        },
      };
      drafts.push(current);
    } else if (current && metaMatch) {
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
    } else if (current && refsMatch) {
      current.card.refs = parseReference(refsMatch[1]);
    }
  });

  // The source repeats a few questions in a second section (same question,
  // same refs, no metadata). Keep the first, fuller entry; refuse real clashes.
  const seen = new Map<string, Draft>();
  const skipped: string[] = [];
  const cards = [];
  for (const draft of drafts) {
    const { id, card, line } = draft;
    const first = seen.get(id);
    if (first) {
      if (JSON.stringify(first.card.refs) !== JSON.stringify(card.refs)) {
        throw new Error(
          `line ${line}: "${card.question}" repeats line ${first.line} with different refs`,
        );
      }
      skipped.push(`line ${line} repeats line ${first.line}: ${card.question}`);
      continue;
    }
    seen.set(id, draft);
    const parsed = discoverCardSchema.safeParse(card);
    if (!parsed.success) {
      throw new Error(
        `line ${line} ("${card.question}"): ${parsed.error.issues.map((x) => x.message).join("; ")}`,
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
