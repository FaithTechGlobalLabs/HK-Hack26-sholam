import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db";
import { entitlements } from "@/db/schema";

export interface Entitlement {
  deviceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
}

const FILE = path.join(process.cwd(), ".data", "entitlements.json");

function rowFromDb(row: {
  deviceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
}): Entitlement {
  return {
    deviceId: row.deviceId,
    customerId: row.customerId,
    subscriptionId: row.subscriptionId,
    status: row.status,
    priceId: row.priceId,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readFileRows(): Promise<Entitlement[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Entitlement[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFileRows(rows: Entitlement[]): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(rows));
}

/**
 * Postgres when it is configured and the billing table exists. Otherwise a
 * local file, so Checkout can be tried before Supabase is connected.
 * The phone never reads either store directly.
 */
export async function findEntitlement(
  deviceId: string,
  customerId: string | null,
): Promise<Entitlement | null> {
  if (isDatabaseConfigured()) {
    try {
      const db = getDb();
      const byDevice = await db
        .select()
        .from(entitlements)
        .where(eq(entitlements.deviceId, deviceId))
        .limit(1);
      if (byDevice[0]) return rowFromDb(byDevice[0]);
      if (customerId) {
        const byCustomer = await db
          .select()
          .from(entitlements)
          .where(eq(entitlements.customerId, customerId))
          .limit(1);
        if (byCustomer[0]) return rowFromDb(byCustomer[0]);
      }
      return null;
    } catch (err) {
      console.warn(
        "[billing] entitlement read fell back to disk",
        errName(err),
      );
    }
  }
  const rows = await readFileRows();
  return (
    rows.find((row) => row.deviceId === deviceId) ??
    (customerId
      ? rows.find((row) => row.customerId === customerId)
      : undefined) ??
    null
  );
}

export async function upsertEntitlement(row: Entitlement): Promise<void> {
  const next = { ...row, updatedAt: new Date().toISOString() };
  if (isDatabaseConfigured()) {
    try {
      const db = getDb();
      await db
        .insert(entitlements)
        .values({
          deviceId: next.deviceId,
          customerId: next.customerId,
          subscriptionId: next.subscriptionId,
          status: next.status,
          priceId: next.priceId,
          currentPeriodEnd: next.currentPeriodEnd
            ? new Date(next.currentPeriodEnd)
            : null,
          updatedAt: new Date(next.updatedAt),
        })
        .onConflictDoUpdate({
          target: entitlements.deviceId,
          set: {
            customerId: next.customerId,
            subscriptionId: next.subscriptionId,
            status: next.status,
            priceId: next.priceId,
            currentPeriodEnd: next.currentPeriodEnd
              ? new Date(next.currentPeriodEnd)
              : null,
            updatedAt: new Date(next.updatedAt),
          },
        });
      return;
    } catch (err) {
      console.warn(
        "[billing] entitlement write fell back to disk",
        errName(err),
      );
    }
  }
  const rows = await readFileRows();
  const rest = rows.filter((item) => item.deviceId !== next.deviceId);
  rest.push(next);
  await writeFileRows(rest);
}

/** Subscription lifecycle events know the Stripe ids, not always the device. */
export async function updateEntitlementsWhere(
  match: { subscriptionId?: string | null; customerId?: string | null },
  patch: Pick<Entitlement, "status" | "priceId" | "currentPeriodEnd"> & {
    customerId?: string | null;
    subscriptionId?: string | null;
  },
): Promise<number> {
  if (isDatabaseConfigured()) {
    try {
      const db = getDb();
      const column = match.subscriptionId
        ? eq(entitlements.subscriptionId, match.subscriptionId)
        : match.customerId
          ? eq(entitlements.customerId, match.customerId)
          : null;
      if (!column) return 0;
      const updated = await db
        .update(entitlements)
        .set({
          status: patch.status,
          priceId: patch.priceId,
          currentPeriodEnd: patch.currentPeriodEnd
            ? new Date(patch.currentPeriodEnd)
            : null,
          customerId: patch.customerId,
          subscriptionId: patch.subscriptionId,
          updatedAt: new Date(),
        })
        .where(column)
        .returning({ deviceId: entitlements.deviceId });
      return updated.length;
    } catch (err) {
      console.warn(
        "[billing] entitlement update fell back to disk",
        errName(err),
      );
    }
  }
  const rows = await readFileRows();
  let count = 0;
  const next = rows.map((row) => {
    const hit =
      (match.subscriptionId && row.subscriptionId === match.subscriptionId) ||
      (match.customerId && row.customerId === match.customerId);
    if (!hit) return row;
    count += 1;
    return {
      ...row,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  });
  if (count) await writeFileRows(next);
  return count;
}

function errName(err: unknown): string {
  return err instanceof Error ? err.name : "error";
}
