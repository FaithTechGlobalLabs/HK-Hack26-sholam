/**
 * The 66-book Protestant canon, keyed by USFM book code (the codes the BSB
 * USJ/USFM release uses). Verse ids across sholam are `BOOK.chapter.verse`,
 * e.g. `JHN.3.16`.
 */

export type Testament = "OT" | "NT";

export interface Book {
  code: string;
  name: string;
  testament: Testament;
  order: number;
  chapters: number;
  /** Extra spellings accepted by `findBook`, beyond the name and code. */
  aliases: readonly string[];
}

type BookRow = [
  code: string,
  name: string,
  chapters: number,
  aliases: string[],
];

const OT: BookRow[] = [
  ["GEN", "Genesis", 50, ["gen", "ge", "gn"]],
  ["EXO", "Exodus", 40, ["exod", "ex"]],
  ["LEV", "Leviticus", 27, ["lev", "lv"]],
  ["NUM", "Numbers", 36, ["num", "nm"]],
  ["DEU", "Deuteronomy", 34, ["deut", "dt"]],
  ["JOS", "Joshua", 24, ["josh"]],
  ["JDG", "Judges", 21, ["judg", "jdgs"]],
  ["RUT", "Ruth", 4, ["ru", "rth"]],
  ["1SA", "1 Samuel", 31, ["1 sam", "1 sm"]],
  ["2SA", "2 Samuel", 24, ["2 sam", "2 sm"]],
  ["1KI", "1 Kings", 22, ["1 kgs", "1 kin"]],
  ["2KI", "2 Kings", 25, ["2 kgs", "2 kin"]],
  ["1CH", "1 Chronicles", 29, ["1 chr", "1 chron"]],
  ["2CH", "2 Chronicles", 36, ["2 chr", "2 chron"]],
  ["EZR", "Ezra", 10, ["ezr"]],
  ["NEH", "Nehemiah", 13, ["neh"]],
  ["EST", "Esther", 10, ["esth"]],
  ["JOB", "Job", 42, ["jb"]],
  ["PSA", "Psalms", 150, ["psalm", "ps", "pss", "psa"]],
  ["PRO", "Proverbs", 31, ["prov", "prv", "pr"]],
  ["ECC", "Ecclesiastes", 12, ["eccl", "eccles", "qoh"]],
  ["SNG", "Song of Songs", 8, ["song", "song of solomon", "sos", "canticles"]],
  ["ISA", "Isaiah", 66, ["isa", "is"]],
  ["JER", "Jeremiah", 52, ["jer", "jr"]],
  ["LAM", "Lamentations", 5, ["lam"]],
  ["EZK", "Ezekiel", 48, ["ezek", "eze", "ezk"]],
  ["DAN", "Daniel", 12, ["dan", "dn"]],
  ["HOS", "Hosea", 14, ["hos"]],
  ["JOL", "Joel", 3, ["jl"]],
  ["AMO", "Amos", 9, ["am"]],
  ["OBA", "Obadiah", 1, ["obad", "ob"]],
  ["JON", "Jonah", 4, ["jnh"]],
  ["MIC", "Micah", 7, ["mic"]],
  ["NAM", "Nahum", 3, ["nah"]],
  ["HAB", "Habakkuk", 3, ["hab"]],
  ["ZEP", "Zephaniah", 3, ["zeph"]],
  ["HAG", "Haggai", 2, ["hag"]],
  ["ZEC", "Zechariah", 14, ["zech"]],
  ["MAL", "Malachi", 4, ["mal"]],
];

const NT: BookRow[] = [
  ["MAT", "Matthew", 28, ["matt", "mt"]],
  ["MRK", "Mark", 16, ["mk", "mrk"]],
  ["LUK", "Luke", 24, ["lk"]],
  ["JHN", "John", 21, ["jn", "jhn"]],
  ["ACT", "Acts", 28, ["acts of the apostles"]],
  ["ROM", "Romans", 16, ["rom", "rm"]],
  ["1CO", "1 Corinthians", 16, ["1 cor"]],
  ["2CO", "2 Corinthians", 13, ["2 cor"]],
  ["GAL", "Galatians", 6, ["gal"]],
  ["EPH", "Ephesians", 6, ["eph"]],
  ["PHP", "Philippians", 4, ["phil", "php"]],
  ["COL", "Colossians", 4, ["col"]],
  ["1TH", "1 Thessalonians", 5, ["1 thess", "1 thes"]],
  ["2TH", "2 Thessalonians", 3, ["2 thess", "2 thes"]],
  ["1TI", "1 Timothy", 6, ["1 tim"]],
  ["2TI", "2 Timothy", 4, ["2 tim"]],
  ["TIT", "Titus", 3, ["tit"]],
  ["PHM", "Philemon", 1, ["philem", "phm"]],
  ["HEB", "Hebrews", 13, ["heb"]],
  ["JAS", "James", 5, ["jas", "jm"]],
  ["1PE", "1 Peter", 5, ["1 pet", "1 pt"]],
  ["2PE", "2 Peter", 3, ["2 pet", "2 pt"]],
  ["1JN", "1 John", 5, ["1 jn", "1 jhn"]],
  ["2JN", "2 John", 1, ["2 jn", "2 jhn"]],
  ["3JN", "3 John", 1, ["3 jn", "3 jhn"]],
  ["JUD", "Jude", 1, ["jud", "jd"]],
  ["REV", "Revelation", 22, ["rev", "rv", "revelations", "apocalypse"]],
];

function toBooks(
  rows: BookRow[],
  testament: Testament,
  offset: number,
): Book[] {
  return rows.map(([code, name, chapters, aliases], i) => ({
    code,
    name,
    testament,
    order: offset + i + 1,
    chapters,
    aliases,
  }));
}

export const BOOKS: readonly Book[] = [
  ...toBooks(OT, "OT", 0),
  ...toBooks(NT, "NT", OT.length),
];

/**
 * Lowercases, strips periods, folds "I/II/III" and "First/Second/Third"
 * prefixes to digits, and puts a single space after a leading digit
 * ("1cor" -> "1 cor").
 */
export function normalizeBookName(input: string): string {
  let s = input.toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  s = s
    .replace(/^(iii|third)\s+/, "3 ")
    .replace(/^(ii|second)\s+/, "2 ")
    .replace(/^(i|first)\s+/, "1 ");
  s = s.replace(/^([123])\s*(?=[a-z])/, "$1 ");
  return s;
}

const INDEX = new Map<string, Book>();
for (const book of BOOKS) {
  const keys = [
    book.code,
    book.name,
    book.name.replace(/\s+/g, ""),
    ...book.aliases,
  ];
  for (const key of keys) INDEX.set(normalizeBookName(key), book);
}

export function findBook(input: string): Book | undefined {
  return INDEX.get(normalizeBookName(input));
}

export function bookByCode(code: string): Book | undefined {
  return BOOKS.find((b) => b.code === code);
}
