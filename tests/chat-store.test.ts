import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@/db";
import { mergeChatLists, unsavedTabChats } from "@/lib/chat/chat-list";
import type { LocalChat } from "@/lib/chat/local-history";
import {
  appendTurn,
  ChatOwnershipError,
  importTabChats,
  isChatId,
  listChats,
  listChatsQuery,
  loadChat,
  ownedChatQuery,
  ownedMessagesQuery,
} from "@/lib/chat/store";
import {
  type StoredAssistantContent,
  toChatMessages,
  toHistoryTurns,
  userContent,
} from "@/lib/chat/stored-content";

const ALICE = "00000000-0000-4000-8000-00000000a11c";
const BOB = "00000000-0000-4000-8000-000000000b0b";
const CHAT = "11111111-1111-4111-8111-111111111111";

describe("chat store queries are scoped to the signed-in user", () => {
  // postgres-js connects lazily, so building SQL needs no server.
  const db = createDb("postgres://nobody@127.0.0.1:1/none");

  it("lists only the user's chats", () => {
    const { sql, params } = listChatsQuery(db, ALICE, 50).toSQL();
    expect(sql).toMatch(/where "chats"\."user_id" = \$\d/);
    expect(sql).toContain('m."chat_id" = "chats"."id"');
    expect(params).toContain(ALICE);
  });

  it("loads a chat only by id AND owner", () => {
    const { sql, params } = ownedChatQuery(db, ALICE, CHAT).toSQL();
    expect(sql).toMatch(/"chats"\."id" = \$\d and "chats"\."user_id" = \$\d/);
    expect(params).toEqual(expect.arrayContaining([ALICE, CHAT]));
  });

  it("reads messages through the owning chat", () => {
    const { sql, params } = ownedMessagesQuery(db, ALICE, CHAT).toSQL();
    expect(sql).toMatch(/inner join "chats"/);
    expect(sql).toMatch(/"chats"\."user_id" = \$\d/);
    expect(sql).toMatch(/order by "messages"\."seq"/);
    expect(params).toEqual(expect.arrayContaining([ALICE, CHAT]));
  });

  it("never queries a malformed chat id", () => {
    expect(isChatId(CHAT)).toBe(true);
    expect(isChatId("1 or 1=1")).toBe(false);
    expect(isChatId("")).toBe(false);
  });
});

const answer = (text: string): StoredAssistantContent => ({
  v: 1,
  source: "openrouter",
  model: "nvidia/nemotron-3-ultra-550b-a55b:free",
  turn: [{ role: "assistant", content: text }],
  text,
  verses: [
    {
      id: "JHN.3.16",
      label: "John 3:16",
      text: "For God so loved the world…",
      translation: "BSB",
    },
  ],
});

describe("stored content", () => {
  it("turns rows into chat messages with their own verses", () => {
    const messages = toChatMessages(CHAT, [
      { seq: 0, role: "user", content: userContent("Who is Jesus?") },
      { seq: 1, role: "assistant", content: answer("He is…") },
      { seq: 2, role: "assistant", content: { something: "older" } },
    ]);
    expect(messages).toHaveLength(2);
    expect(messages[1].verses["JHN.3.16"].label).toBe("John 3:16");
    expect(messages[0].id).toBe(`${CHAT}:0`);
    expect(toHistoryTurns(messages)).toEqual([
      { role: "user", content: "Who is Jesus?" },
      { role: "assistant", content: "He is…" },
    ]);
  });
});

describe("chat list", () => {
  const local = (id: string, n: number, updatedAt: string): LocalChat => ({
    id,
    title: `tab ${id}`,
    updatedAt,
    messages: Array.from({ length: n }, (_, i) => ({
      id: `${i}`,
      role: i % 2 ? "assistant" : "user",
      text: `m${i}`,
    })),
  });

  it("signed out: this tab's chats, newest first", () => {
    const list = mergeChatLists(
      [
        local("a", 2, "2026-11-14T01:00:00Z"),
        local("b", 2, "2026-11-14T02:00:00Z"),
      ],
      null,
    );
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
    expect(list.every((c) => !c.saved)).toBe(true);
  });

  it("signed in: saved chats plus the tab's unsaved ones", () => {
    const saved = [
      {
        id: "a",
        title: "Saved A",
        updatedAt: "2026-11-14T03:00:00Z",
        messageCount: 2,
      },
      {
        id: "c",
        title: "Saved C",
        updatedAt: "2026-11-13T00:00:00Z",
        messageCount: 4,
      },
    ];
    const tab = [
      local("a", 2, "2026-11-14T01:00:00Z"),
      local("b", 2, "2026-11-14T02:00:00Z"),
      local("c", 6, "2026-11-14T04:00:00Z"),
    ];
    const list = mergeChatLists(tab, saved);
    expect(list.map((c) => [c.id, c.saved])).toEqual([
      ["c", false],
      ["a", true],
      ["b", false],
    ]);
    expect(list.find((c) => c.id === "c")?.title).toBe("Saved C");
    expect(unsavedTabChats(tab, saved).map((c) => c.id)).toEqual(["b", "c"]);
  });
});

/**
 * Against a real Postgres when TEST_DATABASE_URL is set (a throwaway local
 * database: the test drops and recreates the public and auth schemas).
 * Supabase's auth schema and roles are stubbed, then the real migrations
 * in drizzle/ run.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("chat store against Postgres", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(url as string, { max: 1 });
    await db.execute(`
      drop schema if exists public cascade; create schema public;
      drop schema if exists auth cascade; create schema auth;
      create table auth.users (id uuid primary key);
      do $$ begin create role anon; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
      create function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
    `);
    const dir = path.join(__dirname, "../drizzle");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort())
      for (const statement of readFileSync(path.join(dir, file), "utf8").split(
        "--> statement-breakpoint",
      ))
        if (statement.trim()) await db.execute(statement);
    await db.execute(
      `insert into auth.users (id) values ('${ALICE}'), ('${BOB}')`,
    );
  });

  afterAll(async () => {
    await db?.$close();
  });

  it("saves a turn to the owner's account and lists it", async () => {
    await appendTurn(db, ALICE, CHAT, [
      { role: "user", content: userContent("Who is Jesus?") },
      { role: "assistant", content: answer("He is…") },
    ]);
    const chats = await listChats(db, ALICE);
    expect(chats).toHaveLength(1);
    expect(chats[0]).toMatchObject({
      id: CHAT,
      title: "Who is Jesus?",
      messageCount: 2,
    });
    expect(await listChats(db, BOB)).toEqual([]);
  });

  it("appends after the existing rows, never rewriting them", async () => {
    const seq = await appendTurn(db, ALICE, CHAT, [
      { role: "user", content: userContent("Tell me more") },
      { role: "assistant", content: answer("More…") },
    ]);
    expect(seq).toBe(2);
    const found = await loadChat(db, ALICE, CHAT);
    expect(found.status).toBe("owned");
    if (found.status !== "owned") return;
    expect(found.messages.map((m) => m.text)).toEqual([
      "Who is Jesus?",
      "He is…",
      "Tell me more",
      "More…",
    ]);
    expect(found.chat.title).toBe("Who is Jesus?");
  });

  it("keeps other accounts and signed-out visitors out", async () => {
    expect(await loadChat(db, BOB, CHAT)).toEqual({ status: "not-yours" });
    expect(await loadChat(db, null, CHAT)).toEqual({ status: "not-yours" });
    expect(
      await loadChat(db, BOB, "22222222-2222-4222-8222-222222222222"),
    ).toEqual({ status: "missing" });
    await expect(
      appendTurn(db, BOB, CHAT, [
        { role: "user", content: userContent("hijack") },
      ]),
    ).rejects.toBeInstanceOf(ChatOwnershipError);
    const found = await loadChat(db, ALICE, CHAT);
    expect(found.status === "owned" && found.messages).toHaveLength(4);
  });

  it("keeps a tab's chats: new ones, the tail of saved ones, never another account's", async () => {
    const tabOnly = "33333333-3333-4333-8333-333333333333";
    const result = await importTabChats(db, ALICE, [
      {
        id: tabOnly,
        title: "From the tab",
        updatedAt: "2026-11-14T08:00:00.000Z",
        messages: [
          { role: "user", text: "Hello" },
          { role: "assistant", text: "Shalom!" },
        ],
      },
    ]);
    expect(result).toEqual({ saved: [tabOnly], skipped: [] });

    // The tab moved on: only the new messages are added.
    await importTabChats(db, ALICE, [
      {
        id: tabOnly,
        title: "From the tab",
        updatedAt: "2026-11-14T09:00:00.000Z",
        messages: [
          { role: "user", text: "Hello" },
          { role: "assistant", text: "Shalom!" },
          { role: "user", text: "Again" },
          { role: "assistant", text: "Welcome back" },
        ],
      },
    ]);
    const found = await loadChat(db, ALICE, tabOnly);
    expect(
      found.status === "owned" && found.messages.map((m) => m.text),
    ).toEqual(["Hello", "Shalom!", "Again", "Welcome back"]);

    // Bob can't claim or extend Alice's chat by importing its id.
    expect(
      await importTabChats(db, BOB, [
        {
          id: tabOnly,
          title: "x",
          updatedAt: "2026-11-14T09:00:00.000Z",
          messages: [
            { role: "user", text: "Hello" },
            { role: "assistant", text: "Shalom!" },
            { role: "user", text: "Again" },
            { role: "assistant", text: "Welcome back" },
            { role: "user", text: "mine now" },
          ],
        },
      ]),
    ).toEqual({ saved: [], skipped: [tabOnly] });
    const after = await loadChat(db, ALICE, tabOnly);
    expect(after.status === "owned" && after.messages).toHaveLength(4);
  });
});
