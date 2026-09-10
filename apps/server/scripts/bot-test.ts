/**
 * Fetches 2 guest tokens over HTTP, connects both bots to a live server, plays a
 * full random-matchmaking game to completion by always throwing/flicking on its
 * turn, and prints the winner.
 *
 * Usage: SERVER_URL=ws://localhost:2567 tsx scripts/bot-test.ts
 * (the server must already be running - see src/index.ts)
 */
import { DEFAULT_CONFIG } from "@char-guty/game-core";
import type { Guti, MatchState } from "@char-guty/game-core";
import { Client, Room } from "colyseus.js";

interface RoomStateMsg {
  readonly mode: string;
  readonly code: string | null;
  readonly roomPhase: "LOBBY" | "PLAYING" | "ENDED";
  readonly hostUserId: string | null;
  readonly seats: readonly { sessionId: string; userId: string; nickname: string }[];
  readonly match: MatchState | null;
}

interface MatchEndedMsg {
  readonly winner: string | null;
}

interface GuestAuth {
  readonly userId: string;
  readonly token: string;
}

const WS_ENDPOINT = process.env.SERVER_URL ?? "ws://localhost:2567";
const HTTP_ENDPOINT = WS_ENDPOINT.replace(/^ws/, "http");
const POT = 100;
const PLAYER_COUNT = 2;
const TIMEOUT_MS = 60_000;

async function fetchGuestToken(nickname: string): Promise<GuestAuth> {
  const res = await fetch(`${HTTP_ENDPOINT}/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) throw new Error(`guest auth failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { userId: string; token: string };
  return { userId: body.userId, token: body.token };
}

function findGuti(gutis: readonly Guti[], id: number): Guti {
  const guti = gutis.find((g) => g.id === id);
  if (guti === undefined) throw new Error(`guti ${id} not found in state`);
  return guti;
}

function actAsBot(room: Room, name: string, myUserId: string): void {
  room.onMessage<RoomStateMsg>("state", (state) => {
    const match = state.match;
    if (match === null || match.phase === "ENDED") return;
    if (match.currentPlayer !== myUserId) return;

    if (match.phase === "THROW") {
      room.send("THROW");
      return;
    }

    const pair = match.pendingTokkas[0];
    if (pair === undefined) return;
    const [shooterId, targetId] = pair;
    const shooter = findGuti(match.gutis, shooterId);
    const target = findGuti(match.gutis, targetId);
    room.send("TOKKA", {
      shooterId,
      targetId,
      flick: {
        dx: target.x - shooter.x,
        dy: target.y - shooter.y,
        power: DEFAULT_CONFIG.maxFlickPower / 2,
      },
    });
  });

  room.onMessage<{ message: string }>("error", (payload) => {
    console.error(`[${name}] server error: ${payload.message}`);
  });

  room.onError((code, message) => console.error(`[${name}] room error ${code}: ${message ?? ""}`));
}

function waitForMatchEnd(room: Room): Promise<MatchEndedMsg> {
  return new Promise((resolve) => {
    room.onMessage<MatchEndedMsg>("matchEnded", (payload) => resolve(payload));
  });
}

async function main(): Promise<void> {
  console.log(`Fetching guest tokens from ${HTTP_ENDPOINT} ...`);
  const bot1Auth = await fetchGuestToken("bot-1");
  const bot2Auth = await fetchGuestToken("bot-2");
  console.log(`bot-1 guest userId ${bot1Auth.userId}`);
  console.log(`bot-2 guest userId ${bot2Auth.userId}`);

  console.log(`Connecting 2 bots to ${WS_ENDPOINT} ...`);
  const joinOptions = { mode: "random" as const, playerCount: PLAYER_COUNT, pot: POT };

  const client1 = new Client(WS_ENDPOINT);
  const room1 = await client1.joinOrCreate("guti", {
    ...joinOptions,
    token: bot1Auth.token,
    nickname: "bot-1",
  });
  console.log(`bot-1 joined room ${room1.roomId} as ${room1.sessionId}`);
  actAsBot(room1, "bot-1", bot1Auth.userId); // registered before bot-2 joins, so no broadcast is missed

  const client2 = new Client(WS_ENDPOINT);
  const room2 = await client2.joinOrCreate("guti", {
    ...joinOptions,
    token: bot2Auth.token,
    nickname: "bot-2",
  });
  console.log(`bot-2 joined room ${room2.roomId} as ${room2.sessionId}`);
  actAsBot(room2, "bot-2", bot2Auth.userId);

  if (room1.roomId !== room2.roomId) {
    throw new Error(`bots landed in different rooms: ${room1.roomId} vs ${room2.roomId}`);
  }

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`match did not finish within ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  const { winner } = await Promise.race([waitForMatchEnd(room1), timeout]);

  console.log(`Winner: ${winner}`);

  await room1.leave();
  await room2.leave();
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
