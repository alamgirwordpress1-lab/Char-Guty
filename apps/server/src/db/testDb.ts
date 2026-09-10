import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.js";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** A real (in-process, WASM) Postgres migrated with the actual generated SQL files. */
export async function createTestDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder });
  return db;
}
