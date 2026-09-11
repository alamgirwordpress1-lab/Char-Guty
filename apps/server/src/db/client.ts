import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

/** The concrete node-postgres client (still a Database); the migrator needs this exact type. */
export function createDb(connectionString: string): NodePgDatabase<typeof schema> {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

export const db = createDb(databaseUrl);
