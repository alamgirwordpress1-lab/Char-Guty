import { DEFAULT_CONFIG, flickSpread, GUTI_COUNT } from "@char-guty/game-core";
import type { Flick } from "@char-guty/game-core";
import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config.js";
import {
  FIELD_LEFT,
  FIELD_PX_H,
  FIELD_PX_W,
  FIELD_SCALE,
  FIELD_TOP,
  toScreen,
} from "../game/field.js";
import type { GameRoom } from "../game/GameRoom.js";
import { GutiView, restingAngle } from "../game/GutiView.js";
import type { Side } from "../game/GutiView.js";
import { ads } from "../services/ads.js";
import { fetchWallet, reconnectRoom } from "../services/net.js";
import { gameplayStarted, gameplayStopped } from "../services/platform.js";
import type {
  EventsMsg,
  MatchEndedMsg,
  MatchStateMsg,
  RoomStateMsg,
  TokkaFramesMsg,
} from "../services/roomState.js";
import { clearSession, getSession, updateBalance } from "../state/session.js";
import { PlayerPanel } from "../ui/playerPanel.js";
import { openSettings } from "../ui/settingsDialog.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { dialog, glossyButton, iconButton, menuBackground, panel } from "../ui/widgets.js";
import type { GameButton } from "../ui/widgets.js";

export interface GameSceneData {
  readonly room: GameRoom;
  /** The state that flipped the room to PLAYING; Matchmaking consumed that broadcast already. */
  readonly initialState?: RoomStateMsg;
  /** Dev mock: no wallet refetch, no reconnect wiring. */
  readonly offline?: boolean;
}

type Guti = MatchStateMsg["gutis"][number];

/** The between-games result panel, up while the room deals the next game. */
interface RoundOver {
  readonly container: Phaser.GameObjects.Container;
  readonly status: Phaser.GameObjects.Text;
  readonly notice: Phaser.GameObjects.Text;
  /** Local epoch ms the next game is due; null while the room is short of players. */
  nextRoundAt: number | null;
}

const THROW_MS = 900;
const FRAME_MS = DEFAULT_CONFIG.dt * 1000;
const TOAST_MS = 650;
const COUNT_MS = 320;
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;
/** Carrom-style aiming, in field px: a shorter pull is cancelled, this long or more is full power. */
const MIN_PULL = 8;
const MAX_PULL = 110;
/**
 * The aim arrow starts just clear of the guti and grows with power but stays short: it shows
 * the direction, not a line to the target, so landing a tokka still takes a good eye.
 */
const ARROW_START_PX = 30;
const ARROW_MAX_PX = 70;
const OPPONENTS_Y = 196;
const MY_PANEL_Y = 1110;
/** Width of the wooden frame around the board, on screen. */
const BOARD_FRAME = 32;

/**
 * Server-authoritative match view. Everything the server sends is applied through a
 * single promise queue so a throw animation or tokka replay finishes before the state
 * that follows it lands (the server emits tokkaFrames -> events -> state).
 *
 * The room outlives a game: when one ends, a result panel covers the board until the
 * server deals the next one, which then arrives through the same queue as any state.
 */
export class GameScene extends Phaser.Scene {
  private room!: GameRoom;
  private offline = false;
  private me = "";
  private alive = false;
  private readonly nicknames = new Map<string, string>();
  private readonly gutis = new Map<number, GutiView>();
  private readonly panels = new Map<string, PlayerPanel>();
  /** Who the panels were built for, so they're only rebuilt when the players change. */
  private seating = "";
  private latest: RoomStateMsg | null = null;
  private queue: Promise<void> = Promise.resolve();

  private prizeIcon!: Phaser.GameObjects.Image;
  private prizeText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private throwBtn!: GameButton;
  private overlay!: Phaser.GameObjects.Container;
  private overlayText!: Phaser.GameObjects.Text;
  private roundOver: RoundOver | null = null;

  private clockOffset = 0;
  private deadline: number | null = null;
  /** True while it's this player's tokka and no flick has been sent for it yet. */
  private canTokka = false;
  private aim: { shooter: GutiView; pointerId: number } | null = null;

  constructor() {
    super("Game");
  }

  create(data: GameSceneData): void {
    this.room = data.room;
    this.offline = data.offline ?? false;
    this.me = getSession().userId;
    this.alive = true;
    this.nicknames.clear();
    this.gutis.clear();
    this.panels.clear();
    this.seating = "";
    this.latest = null;
    this.queue = Promise.resolve();
    this.deadline = null;
    this.canTokka = false;
    this.aim = null;
    this.roundOver = null;

    menuBackground(this);
    this.buildTopBar();
    this.buildBoard();
    this.buildControls();
    this.buildOverlay();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.updateAim(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.endAim(pointer));
    this.events.once("shutdown", () => this.cleanup());

    this.bindRoom(this.room);
    const initial = data.initialState;
    if (initial !== undefined) this.enqueue(() => this.applyState(initial));
    if (!this.offline) void this.refreshWallet();
    gameplayStarted();
  }

  override update(): void {
    const round = this.roundOver;
    if (round !== null && round.nextRoundAt !== null) {
      const seconds = Math.max(0, Math.ceil((round.nextRoundAt - Date.now()) / 1000));
      round.status.setText(`Next game in ${seconds}s`);
    }

    const match = this.latest?.match;
    const ticking = match !== null && match !== undefined && match.phase !== "ENDED";
    const left =
      ticking && this.deadline !== null
        ? (this.deadline - (Date.now() + this.clockOffset)) / DEFAULT_CONFIG.turnTimeoutMs
        : null;
    for (const [id, seat] of this.panels) {
      seat.setTimer(ticking && id === match.currentPlayer ? left : null);
    }
  }

  // ---- construction ----

  private buildTopBar(): void {
    iconButton(this, 66, 66, "icon-back", () => this.confirmLeave(), { size: 80 });
    panel(this, GAME_WIDTH / 2, 66, 320, 84, "glass");
    this.prizeIcon = this.add.image(GAME_WIDTH / 2 - 112, 66, "icon-coin").setDisplaySize(50, 50);
    this.prizeText = this.add
      .text(GAME_WIDTH / 2 + 20, 66, "", { ...TEXT.heading, color: COLOR.goldText })
      .setOrigin(0.5);
    iconButton(this, GAME_WIDTH - 66, 66, "icon-gear", () => openSettings(this), { size: 80 });
  }

  private buildBoard(): void {
    const cx = FIELD_LEFT + FIELD_PX_W / 2;
    const cy = FIELD_TOP + FIELD_PX_H / 2;
    this.add.nineslice(
      cx,
      cy,
      "board-frame",
      undefined,
      FIELD_PX_W + BOARD_FRAME * 2,
      FIELD_PX_H + BOARD_FRAME * 2,
      52,
      52,
      52,
      52,
    );
    this.add.image(cx, cy, "courtyard-bg").setDisplaySize(FIELD_PX_W, FIELD_PX_H);
    this.turnText = this.add
      .text(GAME_WIDTH / 2, FIELD_TOP - BOARD_FRAME - 40, "", { ...TEXT.title, fontSize: "34px" })
      .setOrigin(0.5);
    this.aimGfx = this.add.graphics().setDepth(10);
  }

  private buildControls(): void {
    this.hintText = this.add
      .text(GAME_WIDTH / 2, FIELD_TOP + FIELD_PX_H + BOARD_FRAME + 48, "", {
        ...TEXT.body,
        color: COLOR.muted,
        align: "center",
      })
      .setOrigin(0.5);
    this.throwBtn = glossyButton(this, 560, MY_PANEL_Y, "THROW", () => this.sendThrow(), {
      width: 280,
      height: 116,
      color: "green",
      fontSize: 42,
    });
    this.throwBtn.container.setVisible(false);
  }

  private buildOverlay(): void {
    const bg = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      COLOR.deepNavy,
      0.8,
    );
    this.overlayText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "", { ...TEXT.title, align: "center" })
      .setOrigin(0.5)
      .setWordWrapWidth(600);
    this.overlay = this.add.container(0, 0, [bg, this.overlayText]).setDepth(250).setVisible(false);
  }

  // ---- room wiring ----

  private bindRoom(room: GameRoom): void {
    room.onMessage<RoomStateMsg>("state", (state) => this.enqueue(() => this.applyState(state)));
    room.onMessage<EventsMsg>("events", (events) => this.enqueue(() => this.playEvents(events)));
    room.onMessage<TokkaFramesMsg>("tokkaFrames", (frames) =>
      this.enqueue(() => this.replayFrames(frames)),
    );
    room.onMessage<MatchEndedMsg>("matchEnded", (payload) => {
      // Stamped on arrival rather than when the queue gets to it, so the countdown isn't
      // late by however long the final throw/tokka animations take to play out.
      const nextRoundAt = Date.now() + payload.nextRoundInMs;
      this.enqueue(() => this.showRoundOver(payload, nextRoundAt));
    });
    room.onMessage<{ message: string }>("error", (payload) => this.showError(payload.message));
    room.onLeave((code) => {
      if (code !== 1000) void this.handleDisconnect();
    });
    room.onError((code, message) => void this.toast(`${code}: ${message ?? ""}`));
  }

  private enqueue(task: () => Promise<void> | void): void {
    this.queue = this.queue
      .then(async () => {
        if (this.alive) await task();
      })
      .catch((err: unknown) => console.error(err));
  }

  // ---- state ----

  private applyState(state: RoomStateMsg): void {
    if (this.roundOver !== null) {
      if (!this.isNextGame(state)) {
        if (state.roomPhase === "LOBBY") this.showWaitingForPlayers(state);
        return;
      }
      this.closeRoundOver();
    }

    this.latest = state;
    this.clockOffset = state.serverNow - Date.now();
    this.deadline = state.turnDeadlineAt;
    this.rememberNames(state.seats);

    const match = state.match;
    if (match === null) return;
    this.syncGutis(match.gutis);
    this.refreshHud(state, match);

    const myTurn = match.currentPlayer === this.me && match.phase !== "ENDED";
    this.throwBtn.container.setVisible(myTurn && match.phase === "THROW");
    this.throwBtn.setEnabled(true);
    this.canTokka = myTurn && match.phase === "TOKKA";
    if (!this.canTokka) this.cancelAim();
    this.hintText.setText(this.canTokka ? this.tokkaHint() : "");
  }

  /** While the result is up, a live game in the room is the next one, scores back at zero. */
  private isNextGame(state: RoomStateMsg): boolean {
    return state.roomPhase === "PLAYING" && state.match !== null && state.match.phase !== "ENDED";
  }

  private rememberNames(seats: RoomStateMsg["seats"]): void {
    const computers = seats.filter((seat) => seat.isComputer);
    for (const seat of seats) {
      const number = computers.length > 1 ? ` ${computers.indexOf(seat) + 1}` : "";
      this.nicknames.set(seat.userId, seat.isComputer ? `Computer${number}` : seat.nickname);
    }
  }

  private tokkaHint(): string {
    const left = this.latest?.match?.tokkasLeft ?? 0;
    return `Hold any guti, pull back and let go\nTokkas left: ${left}`;
  }

  private syncGutis(gutis: readonly Guti[]): void {
    const seen = new Set<number>();
    for (const g of gutis) {
      seen.add(g.id);
      const p = toScreen(g.x, g.y);
      const view = this.gutis.get(g.id);
      if (view === undefined) {
        this.gutis.set(g.id, this.createGuti(g.id, g.side, p.x, p.y, restingAngle(g.x, g.y)));
      } else {
        view.setPosition(p.x, p.y);
        view.setSide(g.side);
      }
    }
    for (const [id, view] of this.gutis) {
      if (!seen.has(id)) {
        this.gutis.delete(id);
        this.knockOut(view);
      }
    }
  }

  /** A guti going out after a tokka swells and fades away rather than just vanishing. */
  private knockOut(view: GutiView): void {
    view.container.disableInteractive();
    this.tweens.add({
      targets: view.container,
      scale: 1.6,
      alpha: 0,
      duration: 350,
      ease: "Quad.easeOut",
      onComplete: () => view.destroy(),
      onStop: () => view.destroy(),
    });
  }

  private createGuti(id: number, side: Side, x: number, y: number, angle: number): GutiView {
    const view = new GutiView(this, id, side, x, y, angle);
    view.container.on("pointerdown", (pointer: Phaser.Input.Pointer) =>
      this.beginAim(view, pointer),
    );
    return view;
  }

  private refreshHud(state: RoomStateMsg, match: MatchStateMsg): void {
    const practice = state.mode === "computer";
    this.prizeIcon.setVisible(!practice);
    this.prizeText
      .setText(practice ? "PRACTICE" : `WIN ${match.pot}`)
      .setX(GAME_WIDTH / 2 + (practice ? 0 : 20));

    this.seatPlayers(match.players);
    for (const id of match.players) {
      const seat = this.panels.get(id);
      seat?.setScore(match.scores[id] ?? 0, match.pot);
      seat?.setActive(id === match.currentPlayer && match.phase !== "ENDED");
    }

    const current = this.nicknames.get(match.currentPlayer) ?? "Player";
    this.turnText.setText(
      match.phase === "ENDED"
        ? ""
        : match.currentPlayer === this.me
          ? "YOUR TURN"
          : `${current.toUpperCase()}'S TURN`,
    );
  }

  /** Opponents across the top, you along the bottom next to the throw button. */
  private seatPlayers(players: readonly string[]): void {
    const seating = players.join("|");
    if (seating === this.seating) return;
    this.seating = seating;
    for (const seat of this.panels.values()) seat.container.destroy();
    this.panels.clear();

    const opponents = players.filter((id) => id !== this.me);
    const width = opponents.length === 1 ? 440 : opponents.length === 2 ? 336 : 222;
    const gap = 12;
    const total = opponents.length * width + (opponents.length - 1) * gap;
    opponents.forEach((id, i) => {
      const x = GAME_WIDTH / 2 - total / 2 + width / 2 + i * (width + gap);
      const name = this.nicknames.get(id) ?? "Player";
      this.panels.set(id, new PlayerPanel(this, x, OPPONENTS_Y, width, { name, id, isMe: false }));
    });
    if (players.includes(this.me)) {
      const name = getSession().nickname;
      this.panels.set(
        this.me,
        new PlayerPanel(this, 210, MY_PANEL_Y, 380, { name, id: this.me, isMe: true }),
      );
    }
  }

  private async refreshWallet(): Promise<void> {
    try {
      const wallet = await fetchWallet(getSession().token);
      updateBalance(wallet.coins, wallet.winPoints);
    } catch {
      // keep the balance the menus loaded
    }
  }

  // ---- events / animation ----

  private async playEvents(events: EventsMsg): Promise<void> {
    let lastWasTokka = false;
    for (const event of events) {
      switch (event.type) {
        case "THROW":
          await this.playThrow(event.player, event.result.gutis);
          if (event.result.outcome === "four") await this.countOff();
          await this.toast(this.describeThrow(event.result.flatCount));
          lastWasTokka = false;
          break;
        case "SCORE":
          if (lastWasTokka) this.playSfx("sfx-tokka-hit");
          await this.toast(`+${event.points}`);
          lastWasTokka = false;
          break;
        case "DIE":
          this.playSfx("sfx-die");
          await this.toast("DIE!");
          lastWasTokka = false;
          break;
        case "WIN":
          this.playSfx("sfx-win");
          await this.toast(event.reason === "ZERO_FLAT" ? "INSTANT WIN!" : "WIN!");
          lastWasTokka = false;
          break;
        case "TOKKA":
          lastWasTokka = true;
          break;
        case "TURN":
          lastWasTokka = false;
          break;
      }
    }
  }

  private describeThrow(flatCount: number): string {
    if (flatCount === GUTI_COUNT) return "ALL 4 FLAT!";
    if (flatCount === 0) return "ALL 4 ROUND!";
    return `${flatCount} FLAT · ${GUTI_COUNT - flatCount} ROUND`;
  }

  /** All four flat: count them off one by one, left to right, 1 2 3 4. */
  private async countOff(): Promise<void> {
    const views = [...this.gutis.values()].sort((a, b) => a.x - b.x);
    for (const [i, view] of views.entries()) {
      this.playSfx("sfx-land");
      await this.floatText(String(i + 1), view.x, view.y - 30, COUNT_MS, COLOR.goldText);
    }
  }

  /** No-ops if the sound failed to load - see BootScene's asset fallback comment. */
  private playSfx(key: string): void {
    if (this.cache.audio.exists(key)) this.sound.play(key);
  }

  /** Tosses the sticks in from the thrower's side; each spins down to rest where the server put it. */
  private async playThrow(player: string, gutis: readonly Guti[]): Promise<void> {
    const players = this.latest?.match?.players ?? [];
    const fromLeft = Math.max(0, players.indexOf(player)) % 2 === 0;
    const originX = fromLeft ? FIELD_LEFT - 60 : FIELD_LEFT + FIELD_PX_W + 60;
    const originY = FIELD_TOP + FIELD_PX_H / 2;

    this.playSfx("sfx-throw");
    const flights = gutis.map((g, i) => {
      let view = this.gutis.get(g.id);
      if (view === undefined) {
        view = this.createGuti(g.id, g.side, originX, originY, 0);
        this.gutis.set(g.id, view);
      }
      view.setPosition(originX, originY - i * 10);
      const target = toScreen(g.x, g.y);
      return this.flyGuti(view, target.x, target.y, g.side, restingAngle(g.x, g.y), i * 60);
    });
    await Promise.all(flights);
    this.playSfx("sfx-land");
  }

  private flyGuti(
    view: GutiView,
    x: number,
    y: number,
    side: Side,
    angle: number,
    delay: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({
        targets: view.container,
        scale: 1.35,
        duration: THROW_MS / 2,
        delay,
        yoyo: true,
        ease: "Sine.easeOut",
      });
      this.tweens.add({
        targets: view.container,
        x,
        y,
        angle: 720 + angle,
        duration: THROW_MS,
        delay,
        ease: "Cubic.easeOut",
        onUpdate: (tween) => {
          if (tween.progress > 0.6) view.setSide(side);
        },
        onComplete: () => {
          view.container.setAngle(angle);
          view.setSide(side);
          resolve();
        },
        onStop: () => resolve(),
      });
    });
  }

  /** Replays the server's deterministic sim frames in real time (one frame per dt). */
  private replayFrames(frames: TokkaFramesMsg): Promise<void> {
    const last = frames[frames.length - 1];
    if (last === undefined) return Promise.resolve();
    this.cancelAim();
    const counter = { i: 0 };
    return new Promise((resolve) => {
      this.tweens.add({
        targets: counter,
        i: frames.length - 1,
        duration: Math.max(200, frames.length * FRAME_MS),
        ease: "Linear",
        onUpdate: () => {
          const frame = frames[Math.round(counter.i)];
          if (frame !== undefined) this.applyFrame(frame);
        },
        onComplete: () => {
          this.applyFrame(last);
          resolve();
        },
        onStop: () => resolve(),
      });
    });
  }

  private applyFrame(frame: readonly Guti[]): void {
    for (const g of frame) {
      const view = this.gutis.get(g.id);
      if (view === undefined) continue;
      const p = toScreen(g.x, g.y);
      view.setPosition(p.x, p.y);
    }
  }

  private toast(text: string): Promise<void> {
    return this.floatText(text, GAME_WIDTH / 2, FIELD_TOP + FIELD_PX_H / 2, TOAST_MS, COLOR.white);
  }

  private floatText(
    text: string,
    x: number,
    y: number,
    duration: number,
    color: string,
  ): Promise<void> {
    const label = this.add
      .text(x, y, text, { ...TEXT.title, fontSize: "52px", color })
      .setOrigin(0.5)
      .setDepth(20);
    return new Promise((resolve) => {
      const done = (): void => {
        label.destroy();
        resolve();
      };
      this.tweens.add({
        targets: label,
        y: y - 90,
        alpha: 0,
        duration,
        ease: "Quad.easeOut",
        onComplete: done,
        onStop: done,
      });
    });
  }

  // ---- actions ----

  private sendThrow(): void {
    this.throwBtn.setEnabled(false);
    this.room.send("THROW");
  }

  private beginAim(view: GutiView, pointer: Phaser.Input.Pointer): void {
    if (this.aim !== null || !this.canTokka) return;
    this.aim = { shooter: view, pointerId: pointer.id };
    view.setHighlight("active");
    this.hintText.setText("Pull further back for more power");
  }

  private updateAim(pointer: Phaser.Input.Pointer): void {
    if (this.aim === null || pointer.id !== this.aim.pointerId) return;
    const { shooter } = this.aim;
    this.aimGfx.clear();
    this.aimGfx
      .lineStyle(3, 0xffffff, 0.55)
      .lineBetween(shooter.x, shooter.y, pointer.worldX, pointer.worldY);
    const flick = this.flickFrom(shooter, pointer);
    if (flick === null) return;

    const length = Math.hypot(flick.dx, flick.dy);
    const ux = flick.dx / length;
    const uy = flick.dy / length;
    const strength = flick.power / DEFAULT_CONFIG.maxFlickPower;
    const color = strength > 0.66 ? 0xef4444 : strength > 0.33 ? 0xfb923c : COLOR.gold;
    // The wedge the flick can stray into: the harder the pull, the wider it opens.
    const coneLength = ARROW_START_PX + ARROW_MAX_PX + 60;
    const coneHalfWidth = coneLength * flickSpread(flick.power, DEFAULT_CONFIG);
    const coneX = shooter.x + ux * coneLength;
    const coneY = shooter.y + uy * coneLength;
    this.aimGfx
      .fillStyle(color, 0.25)
      .fillTriangle(
        shooter.x,
        shooter.y,
        coneX - uy * coneHalfWidth,
        coneY + ux * coneHalfWidth,
        coneX + uy * coneHalfWidth,
        coneY - ux * coneHalfWidth,
      );
    const reach = ARROW_START_PX + strength * ARROW_MAX_PX;
    const tipX = shooter.x + ux * reach;
    const tipY = shooter.y + uy * reach;
    this.aimGfx
      .lineStyle(8, color, 0.95)
      .lineBetween(shooter.x + ux * ARROW_START_PX, shooter.y + uy * ARROW_START_PX, tipX, tipY);
    this.aimGfx
      .fillStyle(color, 0.95)
      .fillTriangle(
        tipX + ux * 18,
        tipY + uy * 18,
        tipX - uy * 12,
        tipY + ux * 12,
        tipX + uy * 12,
        tipY - ux * 12,
      );
  }

  private endAim(pointer: Phaser.Input.Pointer): void {
    if (this.aim === null || pointer.id !== this.aim.pointerId) return;
    const { shooter } = this.aim;
    this.cancelAim();
    const flick = this.flickFrom(shooter, pointer);
    if (!this.canTokka) return;
    if (flick === null) {
      this.hintText.setText(this.tokkaHint());
      return;
    }
    this.canTokka = false;
    this.hintText.setText("");
    this.room.send("TOKKA", { shooterId: shooter.id, flick });
  }

  private cancelAim(): void {
    this.aim?.shooter.setHighlight("none");
    this.aim = null;
    this.aimGfx.clear();
  }

  /** Like a carrom striker: pulled back, it flies the opposite way, harder the further the pull. */
  private flickFrom(shooter: GutiView, pointer: Phaser.Input.Pointer): Flick | null {
    const dx = shooter.x - pointer.worldX;
    const dy = shooter.y - pointer.worldY;
    const pull = Math.hypot(dx, dy) / FIELD_SCALE;
    if (pull < MIN_PULL) return null;
    const power = (Math.min(pull, MAX_PULL) / MAX_PULL) * DEFAULT_CONFIG.maxFlickPower;
    return { dx, dy, power };
  }

  // ---- end of game / leaving / disconnect ----

  private showRoundOver(payload: MatchEndedMsg, nextRoundAt: number): void {
    // Between one game and the next is where an interstitial goes: Facebook and CrazyGames
    // show one, the plain web build has none. Play has stopped first, so it interrupts nothing.
    gameplayStopped();
    void ads.showInterstitial();
    if (!this.offline) void this.refreshWallet();
    this.roundOver?.container.destroy();

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const won = payload.winner !== null && payload.winner === this.me;
    const staked = payload.settlement.stakes.length > 0;
    const delta = payload.settlement.deltas[this.me] ?? 0;
    const winner = payload.winner === null ? null : (this.nicknames.get(payload.winner) ?? null);

    // Interactive only to swallow input meant for the board underneath.
    const dim = this.add
      .rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, COLOR.deepNavy, 0.8)
      .setInteractive();
    const parts: Phaser.GameObjects.GameObject[] = [
      dim,
      panel(this, cx, cy + 60, 600, 660, "card"),
      this.add.image(cx, cy - 250, "burst").setDisplaySize(270, 270),
      this.add.image(cx, cy - 252, won ? "icon-crown" : "icon-trophy").setDisplaySize(120, 120),
      this.add
        .text(cx, cy - 70, won ? "YOU WON!" : "YOU LOST", {
          ...TEXT.hero,
          fontSize: "66px",
          color: won ? COLOR.goldText : COLOR.white,
        })
        .setOrigin(0.5),
    ];
    if (!won && winner !== null) {
      parts.push(this.add.text(cx, cy + 4, `${winner} won this game`, TEXT.body).setOrigin(0.5));
    }
    if (staked) {
      const sign = delta > 0 ? "+" : "";
      parts.push(
        this.add.image(cx - 70, cy + 76, "icon-coin").setDisplaySize(56, 56),
        this.add
          .text(cx - 32, cy + 76, `${sign}${delta}`, {
            ...TEXT.title,
            color: delta >= 0 ? COLOR.win : COLOR.lose,
          })
          .setOrigin(0, 0.5),
      );
    }
    const status = this.add.text(cx, cy + 164, "", TEXT.body).setOrigin(0.5);
    const notice = this.add
      .text(cx, cy + 212, "", { ...TEXT.small, align: "center", wordWrap: { width: 520 } })
      .setOrigin(0.5);
    const home = glossyButton(this, cx, cy + 300, "HOME", () => this.leaveToHome(), {
      width: 360,
      height: 96,
      color: "blue",
      icon: "icon-home",
    });
    parts.push(status, notice, home.container);

    const container = this.add.container(0, 0, parts).setDepth(90);
    this.roundOver = { container, status, notice, nextRoundAt };
  }

  private showWaitingForPlayers(state: RoomStateMsg): void {
    if (this.roundOver === null) return;
    this.roundOver.nextRoundAt = null;
    this.roundOver.status.setText(
      `Waiting for players (${state.seats.length}/${state.playerCount})`,
    );
  }

  private closeRoundOver(): void {
    if (this.roundOver === null) return;
    this.roundOver.container.destroy();
    this.roundOver = null;
    gameplayStarted();
    // The new game's stake has just been charged.
    if (!this.offline) void this.refreshWallet();
  }

  private showError(message: string): void {
    if (this.roundOver !== null) this.roundOver.notice.setText(message);
    else void this.toast(message);
  }

  /** Leaving mid-game forfeits the entry, so ask first - unless nothing is at stake. */
  private confirmLeave(): void {
    const playing = this.latest?.match?.phase !== "ENDED" && this.roundOver === null;
    const staked = this.latest !== null && this.latest.mode !== "computer" && !this.offline;
    if (!playing || !staked) {
      this.leaveToHome();
      return;
    }
    const box = dialog(this, "Leave Game?", 600, 460);
    const warning = this.add
      .text(0, -20, "If you leave now you lose\nyour entry coins.", {
        ...TEXT.body,
        align: "center",
      })
      .setOrigin(0.5);
    const leave = glossyButton(this, 0, 130, "LEAVE", () => this.leaveToHome(), {
      width: 320,
      height: 92,
      color: "orange",
    });
    box.add(warning, leave.container);
  }

  private async handleDisconnect(): Promise<void> {
    if (!this.alive || this.offline) return;
    this.showOverlay("Connection lost\nReconnecting...");
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && this.alive; attempt++) {
      try {
        const room = await reconnectRoom(this.room.reconnectionToken);
        this.room = room;
        this.bindRoom(room);
        this.hideOverlay();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));
      }
    }
    if (!this.alive) return;
    this.showOverlay("Couldn't reconnect");
    await new Promise((r) => setTimeout(r, 1500));
    if (this.alive) this.scene.start("Home");
  }

  private showOverlay(text: string): void {
    this.overlayText.setText(text);
    this.overlay.setVisible(true);
  }

  private hideOverlay(): void {
    this.overlay.setVisible(false);
  }

  private leaveToHome(): void {
    void this.room.leave(true);
    if (this.offline) {
      // The dev mock's stand-in session can't talk to the real server, so start over.
      clearSession();
      this.scene.start("Login");
      return;
    }
    this.scene.start("Home");
  }

  private cleanup(): void {
    this.alive = false;
    gameplayStopped();
    this.aim = null;
    this.roundOver = null;
    this.room.removeAllListeners();
    this.input.removeAllListeners();
    this.gutis.clear();
    this.panels.clear();
  }
}
