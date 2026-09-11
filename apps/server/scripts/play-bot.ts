/**
 * A bot opponent for trying multiplayer by hand: it joins a random match, or a friend
 * room by its code, and takes every turn the way a person would until it's stopped.
 *
 * Usage (the server must already be running - see src/index.ts):
 *   tsx scripts/play-bot.ts random [pot=100] [players=2]
 *   tsx scripts/play-bot.ts friend <CODE>
 */
import type { MatchState } from "@char-guty/game-core";
import { Client } from "colyseus.js";
import type { Room } from "colyseus.js";
import { chooseComputerTokka } from "../src/rooms/computerPlayer.js";

interface RoomStateMsg {
  readonly roomPhase: "LOBBY" | "PLAYING" | "ENDED";
  readonly match: MatchState | null;
}

const WS_ENDPOINT = process.env.SERVER_URL ?? "ws://localhost:2567";
const HTTP_ENDPOINT = WS_ENDPOINT.replace(/^ws/, "http");
const NICKNAME = "Bot";
/** Pause before each action, so a human watching can follow the bot's moves. */
const THINK_MS = 1200;
const humanAim = { next: () => Math.random() };

async function guestLogin(): Promise<{ userId: string; token: string }> {
  const res = await fetch(`${HTTP_ENDPOINT}/auth/guest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname: NICKNAME }),
  });
  if (!res.ok) throw new Error(`guest login failed (${res.status})`);
  return (await res.json()) as { userId: string; token: string };
}

async function joinRoom(client: Client, token: string, args: readonly string[]): Promise<Room> {
  const [mode = "random", first, second] = args;
  if (mode === "friend") {
    if (first === undefined) throw new Error("usage: play-bot.ts friend <CODE>");
    const res = await fetch(`${HTTP_ENDPOINT}/rooms/by-code/${first.toUpperCase()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`no friend room with code ${first} (${res.status})`);
    const { roomId } = (await res.json()) as { roomId: string };
    return client.joinById(roomId, { token, nickname: NICKNAME, mode: "friend", playerCount: 2 });
  }
  return client.joinOrCreate("guti", {
    token,
    nickname: NICKNAME,
    mode: "random",
    pot: Number(first ?? 100),
    playerCount: Number(second ?? 2),
  });
}

async function main(): Promise<void> {
  const auth = await guestLogin();
  const room = await joinRoom(new Client(WS_ENDPOINT), auth.token, process.argv.slice(2));
  console.log(`bot joined room ${room.roomId}`);

  let nextAction: NodeJS.Timeout | undefined;
  room.onMessage<RoomStateMsg>("state", (state) => {
    clearTimeout(nextAction);
    const match = state.match;
    if (state.roomPhase !== "PLAYING" || match?.currentPlayer !== auth.userId) return;
    nextAction = setTimeout(() => {
      if (match.phase === "THROW") room.send("THROW");
      else if (match.phase === "TOKKA")
        room.send("TOKKA", chooseComputerTokka(match.gutis, humanAim));
    }, THINK_MS);
  });
  room.onMessage<{ type: string }[]>("events", (events) => {
    console.log(events.map((event) => event.type).join(" "));
  });
  room.onMessage("tokkaFrames", () => {});
  room.onMessage<{ winner: string | null }>("matchEnded", ({ winner }) => {
    console.log(winner === auth.userId ? "bot won the game" : "bot lost the game");
  });
  room.onMessage<{ message: string }>("error", ({ message }) => console.error(message));
  room.onLeave((code) => {
    console.log(`bot left the room (${code})`);
    process.exit(0);
  });
  process.on("SIGINT", () => void room.leave().finally(() => process.exit(0)));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
