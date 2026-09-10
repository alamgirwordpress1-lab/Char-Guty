import "dotenv/config";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Server } from "colyseus";
import { buildApp } from "./app.js";
import { db } from "./db/client.js";
import { GutiRoom } from "./rooms/GutiRoom.js";

const PORT = Number(process.env.PORT ?? 2567);

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
