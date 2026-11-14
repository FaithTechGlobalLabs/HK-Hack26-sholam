/**
 * Postgres schema (Supabase). Source of truth for migrations
 * (`npm run db:generate`). RLS policies are declared here too; the server
 * talks to Postgres through Drizzle as the owner (see src/db/index.ts), so
 * these policies guard supabase-js access from the browser.
 */

import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  anonRole,
  authenticatedRole,
  authUid,
  authUsers,
} from "drizzle-orm/supabase";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const flashcardStatus = pgEnum("flashcard_status", [
  "published",
  "flagged",
  "hidden",
]);
export const flashcardTone = pgEnum("flashcard_tone", ["fun", "fact", "deep"]);
export const flashcardKind = pgEnum("flashcard_kind", ["fact", "discover"]);
export const testament = pgEnum("testament", ["OT", "NT"]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    displayName: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    pgPolicy("profiles: read own", {
      for: "select",
      to: authenticatedRole,
      using: sql`${t.id} = ${authUid}`,
    }),
    pgPolicy("profiles: update own", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.id} = ${authUid}`,
      withCheck: sql`${t.id} = ${authUid}`,
    }),
  ],
).enableRLS();

export const chats = pgTable(
  "chats",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text().notNull().default("New chat"),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("chats_user_updated_idx").on(t.userId, t.updatedAt.desc()),
    pgPolicy("chats: owner only", {
      for: "all",
      to: authenticatedRole,
      using: sql`${t.userId} = ${authUid}`,
      withCheck: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

/**
 * One row per API turn. `content` holds the verbatim Anthropic content
 * blocks (text, thinking, tool_use, tool_result) so history can be replayed
 * unchanged. Append-only: never edit or reorder past rows.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    chatId: uuid()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    seq: integer().notNull(),
    role: messageRole().notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("messages_chat_seq_idx").on(t.chatId, t.seq),
    pgPolicy("messages: via owned chat", {
      for: "select",
      to: authenticatedRole,
      using: sql`exists (select 1 from chats c where c.id = ${t.chatId} and c.user_id = ${authUid})`,
    }),
  ],
).enableRLS();

export const flashcards = pgTable(
  "flashcards",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Stable key for seed cards (e.g. `seed-shortest-verse`); null for user cards. */
    slug: text().unique(),
    /** fact: question + answer. discover: open question + Scripture passages, optionally the team's answer, explanation and takeaway. */
    kind: flashcardKind().notNull().default("fact"),
    question: text().notNull(),
    /** Required for fact cards (see the check below); the team's answer on discover cards, or null. */
    answer: text(),
    explanation: text(),
    /** discover: the team's one-line takeaway. */
    takeaway: text(),
    category: text().notNull(),
    tone: flashcardTone(),
    /** 1 easy … 3 deep; required for fact cards. */
    difficulty: smallint(),
    /** Passage refs: verse ids (JHN.11.35), ranges (MAT.18.21-MAT.18.35), chapters (DAN.4). */
    refs: text().array().notNull(),
    tags: text().array().notNull().default(sql`'{}'::text[]`),
    minutes: smallint(),
    /** Source section heading, e.g. "Life in Jesus' Time". */
    section: text(),
    /** Where a seeded card came from, e.g. "faithmap-132". */
    source: text(),
    authorId: uuid().references(() => authUsers.id, { onDelete: "set null" }),
    status: flashcardStatus().notNull().default("published"),
    search: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, question || ' ' || coalesce(answer, '') || ' ' || coalesce(explanation, '') || ' ' || coalesce(section, ''))`,
    ),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("flashcards_search_idx").using("gin", t.search),
    index("flashcards_category_idx").on(t.category),
    index("flashcards_kind_idx").on(t.kind),
    check(
      "flashcards_fact_fields",
      sql`${t.kind} = 'discover' or (${t.answer} is not null and ${t.tone} is not null and ${t.difficulty} is not null)`,
    ),
    pgPolicy("flashcards: public read", {
      for: "select",
      to: [anonRole, authenticatedRole],
      using: sql`${t.status} = 'published'`,
    }),
    pgPolicy("flashcards: authors insert", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.authorId} = ${authUid}`,
    }),
    pgPolicy("flashcards: authors update", {
      for: "update",
      to: authenticatedRole,
      using: sql`${t.authorId} = ${authUid}`,
      withCheck: sql`${t.authorId} = ${authUid}`,
    }),
  ],
).enableRLS();

export const flashcardReports = pgTable(
  "flashcard_reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    flashcardId: uuid()
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    reason: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("flashcard_reports_once_idx").on(t.flashcardId, t.userId),
    pgPolicy("reports: insert own", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`${t.userId} = ${authUid}`,
    }),
  ],
).enableRLS();

/** Verse text, imported once from the BSB release (scripts/import-bible.ts). */
export const verses = pgTable(
  "verses",
  {
    translation: text().notNull(),
    /** `JHN.3.16` */
    id: text().notNull(),
    book: text().notNull(),
    bookOrder: smallint().notNull(),
    testament: testament().notNull(),
    chapter: smallint().notNull(),
    verse: smallint().notNull(),
    text: text().notNull(),
    search: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, text)`,
    ),
  },
  (t) => [
    primaryKey({ columns: [t.translation, t.id] }),
    index("verses_order_idx").on(
      t.translation,
      t.bookOrder,
      t.chapter,
      t.verse,
    ),
    index("verses_search_idx").using("gin", t.search),
    pgPolicy("verses: public read", {
      for: "select",
      to: [anonRole, authenticatedRole],
      using: sql`true`,
    }),
  ],
).enableRLS();

/**
 * Fixed-window usage counters for `/api/chat`, shared by every serverless
 * instance. `subject` is `global`, `u:<user id>` or `ip:<keyed hash>` (never
 * a raw IP); `period` is `d:2026-11-14` (UTC day) or `h:2026-11-14T05`.
 * Server-only: RLS is on with no policies, so browsers cannot read it.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    subject: text().notNull(),
    period: text().notNull(),
    count: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.subject, t.period] }),
    index("usage_counters_updated_idx").on(t.updatedAt),
  ],
).enableRLS();
