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
import { COLOR, TEXT } from "../ui/theme.js";
import {
  avatar,
  dialog,
  glossyButton,
  menuBackground,
  notify,
  panel,
  shortName,
} from "../ui/widgets.js";
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
/** How long an online search waits alone before offering to invite a friend instead. */
const NO_OPPONENT_NOTICE_MS = 30_000;
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
  private lastState: RoomStateMsg | null = null;
  private noticeShown = false;

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
    this.lastState = null;
    this.noticeShown = false;

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
      if (this.handedOff) return;
      void this.room?.leave(true).catch(() => undefined);
      reportLeftRoom();
    });
    void this.connect();
    // With few players about, an online search can sit alone at its table; after a while
    // say so, and offer a private room at the same stakes to share with a friend.
    if (request.mode === "online") {
      this.time.delayedCall(NO_OPPONENT_NOTICE_MS, () => this.offerFriendInvite());
    }
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
    this.lastState = state;
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
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Char Guty",
          text: `Join my Char Guty room! Code: ${code}`,
          url: link,
        });
        return;
      } catch (err) {
        // Closing the share sheet is the player's choice; any other failure offers the chat apps.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    // On CrazyGames the game sits in a frame on their page, which can't reliably open other
    // apps, so the link is copied there instead.
    if (isCrazyGames()) {
      await this.copyLink(code, link);
      return;
    }
    this.showShareOptions(code, link);
  }

  /**
   * Browsers with no share sheet - the ones inside Messenger and Facebook, mostly - get the
   * chat apps offered directly, each opening its own "send to" screen with the invite in it.
   */
  private showShareOptions(code: string, link: string): void {
    const message = encodeURIComponent(`Join my Char Guty room! Code: ${code} ${link}`);
    // A phone opens the app itself through its link scheme, which leaves this page and its
    // room where they are - an in-app browser would swap the page out for a web address.
    // A computer gets the web version in a new tab.
    const onPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const messenger = onPhone
      ? `fb-messenger://share/?link=${encodeURIComponent(link)}`
      : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
    const whatsapp = onPhone ? `whatsapp://send?text=${message}` : `https://wa.me/?text=${message}`;
    const box = dialog(this, "Share Invite", 620, 760);
    const hint = this.add
      .text(0, -220, "Send your friend the room link:", TEXT.body)
      .setOrigin(0.5);
    const size = { width: 440, height: 96 } as const;
    const toMessenger = glossyButton(
      this,
      0,
      -110,
      "MESSENGER",
      () => this.openChatApp("Messenger", messenger),
      { ...size, color: "blue" },
    );
    const toWhatsApp = glossyButton(
      this,
      0,
      10,
      "WHATSAPP",
      () => this.openChatApp("WhatsApp", whatsapp),
      { ...size, color: "green" },
    );
    const copy = glossyButton(this, 0, 130, "COPY LINK", () => void this.copyLink(code, link), {
      ...size,
      color: "orange",
    });
    const codeText = this.add
      .text(0, 250, `Room code: ${code}`, { ...TEXT.heading, color: COLOR.goldText })
      .setOrigin(0.5);
    box.add(hint, toMessenger.container, toWhatsApp.container, copy.container, codeText);
  }

  /**
   * Hands the invite to a chat app: on a phone the app itself, through its link scheme. If
   * nothing comes up - the page keeps focus, stays in front, and its timers never stall -
   * the player is pointed to the other ways to share.
   */
  private openChatApp(name: string, url: string): void {
    if (url.startsWith("https:")) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const checkAfterMs = 2500;
    const started = Date.now();
    let left = false;
    const onLeave = (): void => {
      left = true;
    };
    window.addEventListener("blur", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    window.location.href = url;
    window.setTimeout(() => {
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
      const opened = left || Date.now() - started > checkAfterMs * 2;
      if (!opened && this.sys.isActive()) {
        notify(this, `${name} didn't open - try another way to share`);
      }
    }, checkAfterMs);
  }

  private async copyLink(code: string, link: string): Promise<void> {
    const copied = await copyText(link);
    if (!this.sys.isActive()) return;
    notify(
      this,
      copied
        ? "Invite link copied - paste it in your chat"
        : `Couldn't copy the link - send your friend the room code: ${code}`,
    );
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

  /** Nobody else has joined this table yet: say so, and offer a private room instead. */
  private offerFriendInvite(): void {
    if (!this.sys.isActive() || this.handedOff || this.leaving || this.noticeShown) return;
    const state = this.lastState;
    if (this.room === null || (state !== null && state.seats.length >= state.playerCount)) return;
    this.noticeShown = true;
    this.add
      .text(
        GAME_WIDTH / 2,
        950,
        "No one else is looking for a game here yet.\nInvite a friend to play with you.",
        { ...TEXT.body, align: "center" },
      )
      .setOrigin(0.5);
    glossyButton(this, GAME_WIDTH / 2, 1060, "INVITE A FRIEND", () => this.inviteFriend(), {
      width: 460,
      height: 96,
      color: "orange",
      icon: "icon-users",
    });
  }

  /** Leaves the public search for a private room at the same table, ready to share. */
  private inviteFriend(): void {
    this.leaving = true;
    this.scene.start("Matchmaking", {
      mode: "friends",
      playerCount: this.request.playerCount,
      pot: this.request.pot,
    } satisfies MatchmakingSceneData);
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

/**
 * Copies text to the clipboard. Where the clipboard API is missing or blocked - in-app
 * browsers, mostly - it falls back to selecting a hidden text box and the old copy command.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    Object.assign(area.style, { position: "fixed", top: "0", left: "0", opacity: "0" });
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
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
