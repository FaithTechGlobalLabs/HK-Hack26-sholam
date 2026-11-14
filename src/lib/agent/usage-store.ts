import "server-only";

import { sql } from "drizzle-orm";
import { type Db, getDb, isDatabaseConfigured } from "@/db";
import {
  type CounterStore,
  createMemoryCounterStore,
  withFallback,
} from "./usage-limit";

/** Counters in Postgres (`usage_counters`), one upsert per call. */
export function createPostgresCounterStore(db: Db): CounterStore {
  return {
    async increment(keys, by = 1) {
      if (!keys.length) return [];
      const values = sql.join(
        keys.map((k) => sql`(${k.subject}, ${k.period}, ${by})`),
        sql`, `,
      );
      const rows = (await db.execute(sql`
        insert into usage_counters (subject, period, count)
        values ${values}
        on conflict (subject, period)
        do update set count = usage_counters.count + excluded.count, updated_at = now()
        returning subject, period, count
      `)) as unknown as { subject: string; period: string; count: number }[];
      maybePrune(db);
      return keys.map(
        (k) =>
          Number(
            rows.find((r) => r.subject === k.subject && r.period === k.period)
              ?.count,
          ) || 0,
      );
    },
    async read(keys) {
      if (!keys.length) return [];
      const rows = (await db.execute(sql`
        select subject, period, count from usage_counters
        where (subject, period) in (${sql.join(
          keys.map((k) => sql`(${k.subject}, ${k.period})`),
          sql`, `,
        )})
      `)) as unknown as { subject: string; period: string; count: number }[];
      return keys.map(
        (k) =>
          Number(
            rows.find((r) => r.subject === k.subject && r.period === k.period)
              ?.count,
          ) || 0,
      );
    },
  };
}

let lastPrune = 0;

/** Drops counters older than three days, at most once an hour per instance. */
function maybePrune(db: Db) {
  const now = Date.now();
  if (now - lastPrune < 3_600_000) return;
  lastPrune = now;
  db.execute(
    sql`delete from usage_counters where updated_at < now() - interval '3 days'`,
  ).catch(() => undefined);
}

let store: CounterStore | undefined;

/**
 * Postgres when DATABASE_URL is set (falling back to per-process memory
 * while Postgres or the table is unavailable), else per-process memory.
 */
export function usageStore(): CounterStore {
  store ??= isDatabaseConfigured()
    ? withFallback(
        createPostgresCounterStore(getDb()),
        createMemoryCounterStore(),
      )
    : createMemoryCounterStore();
  return store;
}
