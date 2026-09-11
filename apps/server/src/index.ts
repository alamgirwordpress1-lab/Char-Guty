import "dotenv/config";
import { fileURLToPath } from "node:url";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { GutiRoom } from "./rooms/GutiRoom.js";

const PORT = Number(process.env.PORT ?? 2567);
/** drizzle/ sits beside both src/ (dev, tsx) and dist/ (production, node), so this resolves from either. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

// Bring the database up to this build's schema before serving anything. Migrations
// already applied are skipped, so on most starts this does nothing.
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const app = buildApp({ db });

// Colyseus wraps whatever request listeners Fastify has already registered on
// this http.Server, so Fastify's routes must be fully ready before the
// WebSocketTransport/Server are constructed below.
await app.ready();

const transport = new WebSocketTransport({ server: app.server });
const gameServer = new Server({ transport });
gameServer.define("guti", GutiRoom).filterBy(["mode", "pot", "playerCount"]);

await gameServer.listen(PORT);
console.log(`char-guty server listening on :${PORT}`);
