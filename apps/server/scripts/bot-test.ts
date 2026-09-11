/**
 * End-to-end checks against a live server:
 * 1. Two bots fetch guest tokens, meet in random matchmaking and play a full game by
 *    always acting on their turn; the room then deals the next game by itself, scores
 *    reset to 0 and the first throw passed to the next seat.
 * 2. A bot opens a vs-computer game: it starts at once against a computer player, takes
 *    no stake, and the computer plays a turn of its own.
 *
 * Usage: SERVER_URL=ws://localhost:2567 tsx scripts/bot-test.ts
 * (the server must already be running - see src/index.ts)
 */
import type { MatchState } from "@char-guty/game-core";
import { Client, Room } from "colyseus.js";
import { chooseComputerTokka } from "../src/rooms/computerPlayer.js";

interface RoomStateMsg {
  readonly roomPhase: "LOBBY" | "PLAYING" | "ENDED";
  readonly seats: readonly { userId: string; isComputer: boolean }[];
  readonly match: MatchState | null;
}

interface MatchEndedMsg {
  readonly winner: string | null;
  readonly nextRoundInMs: number;
}

interface GuestAuth {
  readonly userId: string;
  readonly token: string;
}

const WS_ENDPOINT = process.env.SERVER_URL ?? "ws://localhost:2567";
const HTTP_ENDPOINT = WS_ENDPOINT.replace(/^ws/, "http");
const POT = 100;
const PLAYER_COUNT = 2;
const MATCH_TIMEOUT_MS = 60_000;
const NEXT_GAME_GRACE_MS = 10_000;
const COMPUTER_GAME_START_MS = 5_000;
const DEAD_ON = { next: () => 0.5 };

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

async function fetchCoins(token: string): Promise<number> {
  const res = await fetch(`${HTTP_ENDPOINT}/me`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`wallet fetch failed: ${res.status}`);
  return ((await res.json()) as { coins: number }).coins;
}

function actAsBot(room: Room, name: string, myUserId: string): void {
  room.onMessage<RoomStateMsg>("state", (state) => {
    const match = state.match;
    if (match === null || match.currentPlayer !== myUserId) return;
    if (match.phase === "THROW") room.send("THROW");
    else if (match.phase === "TOKKA") room.send("TOKKA", chooseComputerTokka(match.gutis, DEAD_ON));
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

function waitForState(
  room: Room,
  predicate: (state: RoomStateMsg) => boolean,
): Promise<RoomStateMsg> {
  return new Promise((resolve) => {
    room.onMessage<RoomStateMsg>("state", (state) => {
      if (predicate(state)) resolve(state);
    });
  });
}

function rejectAfter(ms: number, what: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${what} within ${ms}ms`)), ms);
  });
}

async function twoBotsPlayAGame(): Promise<void> {
  console.log(`Fetching guest tokens from ${HTTP_ENDPOINT} ...`);
  const bot1Auth = await fetchGuestToken("bot-1");
  const bot2Auth = await fetchGuestToken("bot-2");

  console.log(`Connecting 2 bots to ${WS_ENDPOINT} ...`);
  const joinOptions = { mode: "random" as const, playerCount: PLAYER_COUNT, pot: POT };

  const room1 = await new Client(WS_ENDPOINT).joinOrCreate("guti", {
    ...joinOptions,
    token: bot1Auth.token,
    nickname: "bot-1",
  });
  actAsBot(room1, "bot-1", bot1Auth.userId); // registered before bot-2 joins, so no broadcast is missed

  const room2 = await new Client(WS_ENDPOINT).joinOrCreate("guti", {
    ...joinOptions,
    token: bot2Auth.token,
    nickname: "bot-2",
  });
  actAsBot(room2, "bot-2", bot2Auth.userId);

  if (room1.roomId !== room2.roomId) {
    throw new Error(`bots landed in different rooms: ${room1.roomId} vs ${room2.roomId}`);
  }

  const ended = await Promise.race([
    waitForMatchEnd(room1),
    rejectAfter(MATCH_TIMEOUT_MS, "match did not finish"),
  ]);
  console.log(`Winner: ${ended.winner} (next game in ${ended.nextRoundInMs}ms)`);

  const { match: next } = await Promise.race([
    waitForState(room1, (s) => s.roomPhase === "PLAYING" && s.match?.turnLog.length === 0),
    rejectAfter(ended.nextRoundInMs + NEXT_GAME_GRACE_MS, "next game did not start"),
  ]);
  if (next === null) throw new Error("next game has no match state");
  if (Object.values(next.scores).some((score) => score !== 0)) {
    throw new Error(`next game did not reset scores: ${JSON.stringify(next.scores)}`);
  }
  if (next.currentPlayer !== next.players[1]) {
    throw new Error(`first throw did not pass to the next seat: ${next.currentPlayer}`);
  }
  console.log(`Next game dealt: scores reset to 0, ${next.currentPlayer} throws first`);

  await room1.leave();
  await room2.leave();
}

async function botPlaysTheComputer(): Promise<void> {
  const auth = await fetchGuestToken("bot-solo");
  const coinsBefore = await fetchCoins(auth.token);
  const room = await new Client(WS_ENDPOINT).create("guti", {
    mode: "computer",
    playerCount: PLAYER_COUNT,
    pot: POT,
    token: auth.token,
    nickname: "bot-solo",
  });
  const started = waitForState(room, (s) => s.roomPhase === "PLAYING");
  actAsBot(room, "bot-solo", auth.userId);

  const state = await Promise.race([
    started,
    rejectAfter(COMPUTER_GAME_START_MS, "vs-computer game did not start"),
  ]);
  const computer = state.seats.find((seat) => seat.isComputer);
  if (computer === undefined) throw new Error("no computer player was seated");
  if ((await fetchCoins(auth.token)) !== coinsBefore) {
    throw new Error("a vs-computer game took a stake");
  }
  console.log("Vs-computer game started at once, with nothing staked");

  await Promise.race([
    waitForState(room, (s) => s.match?.turnLog.some((t) => t.player === computer.userId) ?? false),
    rejectAfter(MATCH_TIMEOUT_MS, "computer player never finished a turn"),
  ]);
  console.log("Computer player finished a turn of its own");
  await room.leave();
}

twoBotsPlayAGame()
  .then(botPlaysTheComputer)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
