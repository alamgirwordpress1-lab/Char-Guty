import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import type { Database } from "./types.js";

export function createDb(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is not set (see .env.example)");
}

export const db = createDb(databaseUrl);
