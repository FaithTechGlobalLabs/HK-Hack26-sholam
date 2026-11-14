/**
 * Search baseline: how well do keyword search over verses and keyword search
 * over BSB section headings find the gold verses in data/search-eval.json?
 * Results and interpretation: docs/SEARCH.md. Read-only: headings go into a
 * TEMP table, so the schema is untouched.
 *
 * Needs the BSB USJ in tmp/ (run `npm run bible:import -- --dry-run` once)
 * and DIRECT_URL. Run: npm run search:baseline
 */

import "../_env";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { BOOKS } from "../../src/lib/bible/books";
import type { UsjNode } from "../../src/lib/bible/usj";
import { scriptDatabaseUrl } from "../_env";

interface Section {
  book: string;
  heading: string;
  start: string;
  end: string;
}

const textOf = (n: UsjNode | string): string =>
  typeof n === "string" ? n : (n.content ?? []).map(textOf).join("");

/** BSB s1/s2 headings with the verse range each one covers. */
function extractSections(): Section[] {
  const out: Section[] = [];
  for (const book of BOOKS) {
    const usj = JSON.parse(
      readFileSync(`tmp/bsb-v5.19/usj/${book.code}.usj`, "utf8"),
    ) as UsjNode;
    let chapter = 0;
    let last = "";
    let pending: string | null = null;
    let open: Section | null = null;
    const walk = (n: UsjNode | string) => {
      if (typeof n === "string") return;
      if (n.type === "chapter") {
        chapter = Number(n.number);
        return;
      }
      if (n.type === "verse") {
        const id = `${book.code}.${chapter}.${n.number}`;
        if (pending) {
          if (open) open.end = last;
          open = { book: book.code, heading: pending, start: id, end: id };
          out.push(open);
          pending = null;
        }
        last = id;
        return;
      }
      if (n.type === "para" && (n.marker === "s1" || n.marker === "s2")) {
        pending = textOf(n).trim();
        return;
      }
      if (n.type === "note") return;
      for (const c of n.content ?? []) walk(c);
    };
    for (const c of usj.content ?? []) walk(c);
    if (open) (open as Section).end = last;
  }
  return out;
}

async function main() {
  const evalSet = JSON.parse(readFileSync("data/search-eval.json", "utf8")) as {
    items: { query: string; gold: string[] }[];
  };
  const sections = extractSections();
  const sql = postgres(scriptDatabaseUrl(), { prepare: false, max: 1 });
  try {
    await sql`create temp table sec (heading text, start_id text, end_id text, search tsvector)`;
    for (let i = 0; i < sections.length; i += 500) {
      const rows = sections
        .slice(i, i + 500)
        .map((s) => ({ heading: s.heading, start_id: s.start, end_id: s.end }));
      await sql`insert into sec ${sql(rows, "heading", "start_id", "end_id")}`;
    }
    await sql`update sec set search = to_tsvector('english', heading)`;

    const position = new Map<string, number>();
    for (const r of await sql`select id, row_number() over (order by book_order, chapter, verse)::int as n from verses where translation = 'BSB'`) {
      position.set(r.id, r.n);
    }
    const anyTerm = (q: string) =>
      sql`to_tsquery('english', ${q
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .join(" | ")})`;

    const score = { and: 0, or: 0, headings: 0, andPlusHeadings: 0 };
    const lines: string[] = [];
    for (const { query, gold } of evalSet.items) {
      const and = (
        await sql`select id from verses where translation = 'BSB' and search @@ websearch_to_tsquery('english', ${query})
                  order by ts_rank_cd(search, websearch_to_tsquery('english', ${query})) desc limit 10`
      ).map((r) => r.id);
      const or = (
        await sql`select id from verses where translation = 'BSB' and search @@ ${anyTerm(query)}
                  order by ts_rank_cd(search, ${anyTerm(query)}, 32) desc limit 10`
      ).map((r) => r.id);
      const secs =
        await sql`select heading, start_id, end_id from sec where search @@ ${anyTerm(query)}
                             order by ts_rank_cd(search, ${anyTerm(query)}, 32) desc limit 3`;
      const inSection = (id: string) =>
        secs.some((s) => {
          const p = position.get(id) ?? -1;
          return (
            p >= (position.get(s.start_id) ?? 0) &&
            p <= (position.get(s.end_id) ?? -1)
          );
        });
      const a = gold.some((g) => and.includes(g));
      const o = gold.some((g) => or.includes(g));
      const h = gold.some(inSection);
      score.and += Number(a);
      score.or += Number(o);
      score.headings += Number(h);
      score.andPlusHeadings += Number(a || h);
      lines.push(
        `${a ? "✓" : "·"}   ${o ? "✓" : "·"}   ${h ? "✓" : "·"}     ${query}   [${secs[0]?.heading ?? "-"}]`,
      );
    }

    const n = evalSet.items.length;
    console.log(
      `${sections.length} section headings extracted\n\nAND OR  HEAD  query   [top heading]\n${lines.join("\n")}\n`,
    );
    console.log(`verse FTS, all terms (recall@10):   ${score.and}/${n}`);
    console.log(`verse FTS, any term (recall@10):    ${score.or}/${n}`);
    console.log(`top-3 headings → section range:     ${score.headings}/${n}`);
    console.log(
      `verse FTS (all terms) ∪ headings:   ${score.andPlusHeadings}/${n}`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
