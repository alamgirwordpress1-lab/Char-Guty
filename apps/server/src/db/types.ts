import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema.js";

/** Driver-agnostic db type: satisfied by both the real node-postgres client and the PGlite test double. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
