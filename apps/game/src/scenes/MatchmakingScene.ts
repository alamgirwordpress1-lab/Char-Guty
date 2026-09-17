import { playerCountSchema, potSchema } from "@char-guty/shared";
import type { JoinOptions } from "@char-guty/shared";
import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { GAME_HEIGHT, GAME_WIDTH, LANDSCAPE } from "../config.js";
import {
  createComputerGame,
  createFriendRoom,
  findRoomByCode,
  joinRandomMatch,
  joinRoomById,
  reconnectRoom,
} from "../services/net.js";
import {
  inviteToRoom,
  isCrazyGames,
  isFacebookInstant,
  reportLeftRoom,
  reportRoom,
  roomLink,
} from "../services/platform.js";
import type { RoomStateMsg } from "../services/roomState.js";
import { getSession } from "../state/session.js";
import { copyInvite, shareInvite } from "../ui/shareDialog.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { avatar, glossyButton, menuBackground, notify, panel, shortName } from "../ui/widgets.js";
import type { GameButton } from "../ui/widgets.js";
import type { ArenaSceneData, GameStart, MatchmakingSceneData, PlayMode } from "./flow.js";

const TITLES: Record<PlayMode, string> = {
  online: "Finding Players",
  computer: "Get Ready",
  friends: "Waiting for Friends",
};

type Point = readonly [x: number, y: number];

/** Portrait runs top to bottom; landscape sets the seats out in one row across the screen. */
const LAYOUT = LANDSCAPE
  ? {
      title: 70,
      stakes: 130,
      seatsY: 300,
      status: 470,
      note: 515,
      code: [640, 600] as Point,
      cancel: [1110, 650] as Point,
      cancelWidth: 300,
    }
  : {
      title: 130,
      stakes: 196,
      seatsY: 540,
      status: 860,
      note: 910,
      code: [360, 990] as Point,
      cancel: [360, 1170] as Point,
      cancelWidth: 340,
    };

/** Where each seat's avatar sits, by player count. */
const SEAT_POSITIONS: Record<number, readonly Point[]> = LANDSCAPE
  ? {
      2: [
        [440, 300],
        [840, 300],
      ],
      3: [
        [340, 300],
        [640, 300],
        [940, 300],
      ],
      4: [
        [250, 300],
        [510, 300],
        [770, 300],
        [1030, 300],
      ],
    }
  : {
      2: [
        [190, 540],
        [530, 540],
      ],
      3: [
        [190, 440],
        [530, 440],
        [360, 680],
      ],
      4: [
        [190, 430],
        [530, 430],
        [190, 670],
        [530, 670],
      ],
    };
const SEAT_AVATAR = 150;
/** A connection dropped while waiting gets this many tries, this far apart - as in GameScene. */
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

/** Opens or joins the room, shows who's in it, and hands the room to Game once it starts. */
export class MatchmakingScene extends Phaser.Scene {
  private request!: MatchmakingSceneData;
  private room: Room | null = null;
  private handedOff = false;
  private leaving = false;
  private codeShown = false;
  private seatViews: Phaser.GameObjects.Container[] = [];
  private stakes!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private cancelButton!: GameButton;

  constructor() {
    super("Matchmaking");
  }

  create(request: MatchmakingSceneData): void {
    this.request = request;
    this.room = null;
    this.handedOff = false;
    this.leaving = false;
    this.codeShown = false;
    this.seatViews = [];

    menuBackground(this);
    this.add.text(GAME_WIDTH / 2, LAYOUT.title, TITLES[request.mode], TEXT.title).setOrigin(0.5);
    this.stakes = this.add
      .text(
        GAME_WIDTH / 2,
        LAYOUT.stakes,
        describeStakes(request.mode, request.pot, request.playerCount),
        { ...TEXT.body, color: COLOR.goldText },
      )
      .setOrigin(0.5);
    this.showSeats([], request.playerCount);
    this.status = this.add
      .text(GAME_WIDTH / 2, LAYOUT.status, "Connecting...", TEXT.body)
      .setOrigin(0.5);
    // Said up front, so nobody is surprised to find a computer across the table.
    if (request.mode === "online") {
      this.add
        .text(
          GAME_WIDTH / 2,
          LAYOUT.note,
          "If nobody comes soon, computer players take the empty seats",
          TEXT.small,
        )
        .setOrigin(0.5);
    }
    const [cancelX, cancelY] = LAYOUT.cancel;
    this.cancelButton = glossyButton(this, cancelX, cancelY, "CANCEL", () => void this.cancel(), {
      width: LAYOUT.cancelWidth,
      height: 96,
      color: "gray",
    });

    this.events.once("shutdown", () => {
      if (this.handedOff) return;
      void this.room?.leave(true).catch(() => undefined);
      reportLeftRoom();
    });
    void this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const room = await this.openRoom();
      if (this.leaving || !this.sys.isActive()) {
        void room.leave(true);
        return;
      }
      this.room = room;
      this.bindRoom(room);
    } catch (err) {
      this.fail(describeError(err));
    }
  }

  private bindRoom(room: Room): void {
    room.onMessage<RoomStateMsg>("state", (state) => this.onState(state));
    room.onMessage<{ message: string }>("error", ({ message }) => this.status.setText(message));
    room.onLeave((code) => {
      if (this.handedOff || this.leaving) return;
      // A clean close means the room itself has gone. Anything else is a dropped connection -
      // the host stepping out to a chat app to send the invite, say - and the seat is held.
      if (code === 1000) this.fail("Lost connection to the room");
      else void this.reconnect(room);
    });
  }

  /** The server keeps a dropped player's seat for a minute (GutiRoom.onLeave): take it back. */
  private async reconnect(dropped: Room): Promise<void> {
    this.status.setText("Connection lost - reconnecting...").setColor(COLOR.muted);
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
      if (!this.sys.isActive() || this.handedOff || this.leaving) return;
      try {
        const room = await reconnectRoom(dropped.reconnectionToken);
        if (!this.sys.isActive() || this.leaving) {
          void room.leave(true);
          return;
        }
        this.room = room;
        this.bindRoom(room);
        this.status.setText("Reconnected").setColor(COLOR.white);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }
    this.fail("Lost connection to the room");
  }

  private async openRoom(): Promise<Room> {
    const { mode, pot, code } = this.request;
    const session = getSession();
    const base = {
      token: session.token,
      nickname: session.nickname,
      playerCount: playerCountSchema.parse(this.request.playerCount),
    };
    if (mode === "friends" && code !== undefined) {
      const roomId = await findRoomByCode(session.token, code);
      return joinRoomById(roomId, { ...base, mode: "friend" } satisfies JoinOptions);
    }
    const stakes = potSchema.parse(pot);
    if (mode === "friends") return createFriendRoom({ ...base, mode: "friend", pot: stakes });
    if (mode === "computer") return createComputerGame({ ...base, mode: "computer", pot: stakes });
    return joinRandomMatch({ ...base, mode: "random", pot: stakes });
  }

  private onState(state: RoomStateMsg): void {
    if (!this.sys.isActive() || this.handedOff || this.leaving) return;
    if (state.code !== null) this.showCode(state.code);
    if (this.room !== null) {
      const seatsFree = state.roomPhase !== "PLAYING" && state.seats.length < state.playerCount;
      reportRoom(this.room.roomId, state.code, seatsFree);
    }
    this.stakes.setText(describeStakes(this.request.mode, state.pot, state.playerCount));
    this.showSeats(state.seats, state.playerCount);
    this.status.setText(`${state.seats.length} / ${state.playerCount} players`);
    if (state.roomPhase === "PLAYING" && this.room !== null) {
      this.handedOff = true;
      this.room.removeAllListeners();
      this.scene.start("Game", { room: this.room, initialState: state } satisfies GameStart);
    }
  }

  private showSeats(seats: RoomStateMsg["seats"], count: number): void {
    for (const view of this.seatViews) {
      this.tweens.killTweensOf(view.list);
      view.destroy();
    }
    this.seatViews = [];
    const me = getSession().userId;

    if (count === 2) {
      const burst = this.add.image(0, 0, "burst").setDisplaySize(170, 170);
      const vs = this.add.text(0, 0, "VS", { ...TEXT.hero, fontSize: "60px" }).setOrigin(0.5);
      this.seatViews.push(this.add.container(GAME_WIDTH / 2, LAYOUT.seatsY, [burst, vs]));
    }

    (SEAT_POSITIONS[count] ?? []).forEach(([x, y], i) => {
      const seat = seats[i];
      if (seat === undefined) {
        const ring = this.add
          .image(0, 0, "avatar-ring")
          .setDisplaySize(SEAT_AVATAR * 1.18, SEAT_AVATAR * 1.18)
          .setAlpha(0.45);
        const mark = this.add
          .text(0, 0, "?", { ...TEXT.hero, fontSize: "80px" })
          .setOrigin(0.5)
          .setAlpha(0.6);
        const waiting = this.request.mode === "friends" ? "Waiting..." : "Searching...";
        const label = this.add.text(0, 118, waiting, TEXT.small).setOrigin(0.5);
        this.tweens.add({ targets: mark, alpha: 0.15, duration: 700, yoyo: true, repeat: -1 });
        this.seatViews.push(this.add.container(x, y, [ring, mark, label]));
        return;
      }
      const name = seat.isComputer ? "Computer" : seat.nickname;
      const face = avatar(this, 0, 0, name, seat.userId, SEAT_AVATAR);
      const label = this.add
        .text(0, 118, seat.userId === me ? "You" : shortName(name), TEXT.heading)
        .setOrigin(0.5);
      this.seatViews.push(this.add.container(x, y, [face, label]));
    });
  }

  private showCode(code: string): void {
    if (this.codeShown) return;
    this.codeShown = true;
    const [x, y] = LAYOUT.code;
    panel(this, x, y, 580, 170, "card");
    this.add.text(x - 100, y - 46, "ROOM CODE", TEXT.small).setOrigin(0.5);
    this.add
      .text(x - 100, y + 18, code, { ...TEXT.title, fontSize: "54px", color: COLOR.goldText })
      .setOrigin(0.5);
    const label = isFacebookInstant ? "INVITE" : "SHARE";
    glossyButton(this, x + 170, y, label, () => void this.shareCode(code), {
      width: 180,
      height: 86,
      color: "orange",
      icon: "icon-share",
      fontSize: 24,
    });
  }

  private async shareCode(code: string): Promise<void> {
    if (isFacebookInstant) {
      try {
        // Facebook's friend picker; the invite carries the code, so a friend lands in this room.
        await inviteToRoom(code, await this.inviteImage());
      } catch {
        notify(this, `Room code: ${code}`);
      }
      return;
    }
    // A link, not just the code: whoever opens it lands in this room without typing it.
    const link = roomLink(code);
    // CrazyGames wants no links out of the game, and offers its own invite button besides:
    // there the link is just copied.
    if (isCrazyGames()) {
      await copyInvite(this, code, link);
      return;
    }
    shareInvite(this, code, link);
  }

  /** The waiting screen itself - seats and room code - as the picture on the invite. */
  private inviteImage(): Promise<string> {
    const [x, y, width, height] = LANDSCAPE
      ? [0, 0, GAME_WIDTH, GAME_HEIGHT]
      : [0, 100, GAME_WIDTH, 1000];
    return new Promise((resolve) => {
      this.game.renderer.snapshotArea(
        x,
        y,
        width,
        height,
        (snapshot) => resolve(snapshot instanceof HTMLImageElement ? snapshot.src : ""),
        "image/jpeg",
        0.8,
      );
    });
  }

  /** Android's back button: the same as CANCEL. */
  handleBack(): void {
    void this.cancel();
  }

  private async cancel(): Promise<void> {
    this.leaving = true;
    const room = this.room;
    this.room = null;
    room?.removeAllListeners();
    await room?.leave(true).catch(() => undefined);
    if (this.request.mode === "friends") this.scene.start("Friends");
    else this.scene.start("Arena", { mode: this.request.mode } satisfies ArenaSceneData);
  }

  private fail(message: string): void {
    if (!this.sys.isActive()) return;
    this.status.setText(message).setColor(COLOR.lose);
    this.cancelButton.setLabel("BACK");
  }
}

function describeStakes(mode: PlayMode, pot: number | null, playerCount: number): string {
  if (pot === null) return "Finding the room...";
  if (mode === "computer") return `Practice · first to ${pot} points`;
  return `Entry ${pot / playerCount} · Win ${pot}`;
}

function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/404|not found/i.test(message)) return "No room found with that code";
  if (/locked|full/i.test(message)) return "That room is already full";
  if (/failed to fetch|networkerror|websocket/i.test(message)) return "Can't reach the game server";
  return message;
}
