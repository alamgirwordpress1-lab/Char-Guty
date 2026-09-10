import { WebSocketTransport } from "@colyseus/ws-transport";
import { matchMaker, Server } from "colyseus";
import Fastify from "fastify";
import { GutiRoom } from "./rooms/GutiRoom.js";

const PORT = Number(process.env.PORT ?? 2567);

const app = Fastify();

app.get("/health", async () => ({ status: "ok" }));

app.get("/rooms/by-code/:code", async (request, reply) => {
  const { code } = request.params as { code: string };
  const rooms = await matchMaker.query({ name: "guti" });
  const room = rooms.find((r) => r.metadata?.code === code);
  if (room === undefined) {
    reply.code(404);
    return { error: "room not found" };
  }
  return { roomId: room.roomId };
});

// Colyseus wraps whatever request listeners Fastify has already registered on
// this http.Server, so Fastify's routes must be fully ready before the
// WebSocketTransport/Server are constructed below.
await app.ready();

const transport = new WebSocketTransport({ server: app.server });
const gameServer = new Server({ transport });
gameServer.define("guti", GutiRoom).filterBy(["mode", "pot", "playerCount"]);

await gameServer.listen(PORT);
console.log(`char-guty server listening on :${PORT}`);
