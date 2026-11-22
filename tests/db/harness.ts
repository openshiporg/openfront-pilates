/**
 * Database harness for the state-machine tests (dissertation §10). Runs against a real Postgres:
 * TEST_DATABASE_URL, a database that `prisma migrate deploy` has brought up to date. Every test
 * creates its own organization, so runs never see each other's rows. When TEST_DATABASE_URL is
 * unset the DB tests are skipped with a message; they never fall back to anything fake.
 */
import { getContext } from "@keystone-6/core/context";

export const dbUrl = process.env.TEST_DATABASE_URL || "";
export const skipDb = dbUrl ? false : "TEST_DATABASE_URL is not set; run `npm test` with a migrated Postgres";

let cached: any = null;
export async function keystoneContext() {
  if (cached) return cached;
  process.env.DATABASE_URL = dbUrl;
  process.env.SESSION_SECRET ||= "x".repeat(40);
  const config = (await import("../../keystone")).default;
  const PrismaModule = await import("@prisma/client");
  cached = getContext(config as any, PrismaModule);
  return cached;
}

let counter = 0;
export const uid = (prefix = "t") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function disconnect() {
  if (cached) await cached.prisma.$disconnect();
}
