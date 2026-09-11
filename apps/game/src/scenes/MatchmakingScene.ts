import { playerCountSchema, potSchema } from "@char-guty/shared";
import type { JoinOptions } from "@char-guty/shared";
import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { GAME_WIDTH } from "../config.js";
import {
  createComputerGame,
  createFriendRoom,
  findRoomByCode,
  joinRandomMatch,
  joinRoomById,
} from "../services/net.js";
import { inviteToRoom, isFacebookInstant } from "../services/platform.js";
import type { RoomStateMsg } from "../services/roomState.js";
import { getSession } from "../state/session.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { avatar, glossyButton, menuBackground, notify, panel, shortName } from "../ui/widgets.js";
import type { GameButton } from "../ui/widgets.js";
import type { ArenaSceneData, GameStart, MatchmakingSceneData, PlayMode } from "./flow.js";

const TITLES: Record<PlayMode, string> = {
  online: "Finding Players",
  computer: "Get Ready",
  friends: "Waiting for Friends",
};

/** Where each seat's avatar sits, by player count. */
const SEAT_POSITIONS: Record<number, readonly (readonly [number, number])[]> = {
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
    this.add.text(GAME_WIDTH / 2, 130, TITLES[request.mode], TEXT.title).setOrigin(0.5);
    this.stakes = this.add
      .text(GAME_WIDTH / 2, 196, describeStakes(request.mode, request.pot, request.playerCount), {
        ...TEXT.body,
        color: COLOR.goldText,
      })
      .setOrigin(0.5);
    this.showSeats([], request.playerCount);
    this.status = this.add.text(GAME_WIDTH / 2, 860, "Connecting...", TEXT.body).setOrigin(0.5);
    this.cancelButton = glossyButton(
      this,
      GAME_WIDTH / 2,
      1170,
      "CANCEL",
      () => void this.cancel(),
      { width: 340, height: 96, color: "gray" },
    );

    this.events.once("shutdown", () => {
      if (!this.handedOff) void this.room?.leave(true).catch(() => undefined);
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
      room.onMessage<RoomStateMsg>("state", (state) => this.onState(state));
      room.onMessage<{ message: string }>("error", ({ message }) => this.status.setText(message));
      room.onLeave(() => {
        if (!this.handedOff && !this.leaving) this.fail("Lost connection to the room");
      });
    } catch (err) {
      this.fail(describeError(err));
    }
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
    if (!this.sys.isActive() || this.handedOff) return;
    if (state.code !== null) this.showCode(state.code);
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
      this.seatViews.push(this.add.container(GAME_WIDTH / 2, 540, [burst, vs]));
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
    const y = 990;
    panel(this, GAME_WIDTH / 2, y, 580, 170, "card");
    this.add.text(GAME_WIDTH / 2 - 100, y - 46, "ROOM CODE", TEXT.small).setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2 - 100, y + 18, code, {
        ...TEXT.title,
        fontSize: "54px",
        color: COLOR.goldText,
      })
      .setOrigin(0.5);
    const label = isFacebookInstant ? "INVITE" : "SHARE";
    glossyButton(this, GAME_WIDTH / 2 + 170, y, label, () => void this.shareCode(code), {
      width: 180,
      height: 86,
      color: "orange",
      icon: "icon-share",
      fontSize: 24,
    });
  }

  private async shareCode(code: string): Promise<void> {
    try {
      if (isFacebookInstant) {
        // Facebook's friend picker; the invite carries the code, so a friend lands in this room.
        await inviteToRoom(code, await this.inviteImage());
        return;
      }
      // Not every browser has a share sheet; the rest get the code copied instead.
      if (typeof navigator.share === "function") {
        await navigator.share({ text: `Join my Char Guty room! Code: ${code}` });
        return;
      }
      await navigator.clipboard.writeText(code);
      notify(this, "Room code copied");
    } catch {
      notify(this, `Room code: ${code}`);
    }
  }

  /** The waiting screen itself - seats and room code - as the picture on the invite. */
  private inviteImage(): Promise<string> {
    return new Promise((resolve) => {
      this.game.renderer.snapshotArea(
        0,
        100,
        GAME_WIDTH,
        1000,
        (snapshot) => resolve(snapshot instanceof HTMLImageElement ? snapshot.src : ""),
        "image/jpeg",
        0.8,
      );
    });
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
