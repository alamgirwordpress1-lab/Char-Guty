import { DEFAULT_CONFIG } from "@char-guty/game-core";
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
import { GutiView } from "../game/GutiView.js";
import type { Side } from "../game/GutiView.js";
import { t } from "../i18n/index.js";
import { fetchWallet, reconnectRoom } from "../services/net.js";
import type {
  EventsMsg,
  MatchEndedMsg,
  MatchStateMsg,
  RoomStateMsg,
  TokkaFramesMsg,
} from "../services/roomState.js";
import { getSession, updateBalance } from "../state/session.js";
import { COLORS, createButton, createPanel, TEXT_STYLES } from "../ui/kit.js";
import type { ButtonHandle } from "../ui/kit.js";

export interface GameSceneData {
  readonly room: GameRoom;
  /** The state that flipped the room to PLAYING; Lobby consumed that broadcast already. */
  readonly initialState?: RoomStateMsg;
  /** Dev mock: no wallet refetch, no reconnect wiring. */
  readonly offline?: boolean;
}

type Guti = MatchStateMsg["gutis"][number];
type Pair = readonly [number, number];

const THROW_MS = 900;
const FRAME_MS = DEFAULT_CONFIG.dt * 1000;
const TOAST_MS = 650;
const MAX_PLAYERS = 4;
const HUD_ROW_Y = 92;
const HUD_ROW_H = 40;
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 2000;

/**
 * Server-authoritative match view. Everything the server sends is applied through a
 * single promise queue so a throw animation or tokka replay finishes before the state
 * that follows it lands (the server emits tokkaFrames -> events -> state).
 */
export class GameScene extends Phaser.Scene {
  private room!: GameRoom;
  private offline = false;
  private me = "";
  private alive = false;
  private readonly nicknames = new Map<string, string>();
  private readonly gutis = new Map<number, GutiView>();
  private latest: RoomStateMsg | null = null;
  private queue: Promise<void> = Promise.resolve();

  private potText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private playerRows: Phaser.GameObjects.Text[] = [];
  private playerScores: Phaser.GameObjects.Text[] = [];
  private turnText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private pairsGfx!: Phaser.GameObjects.Graphics;
  private aimGfx!: Phaser.GameObjects.Graphics;
  private throwBtn!: ButtonHandle;
  private overlay!: Phaser.GameObjects.Container;
  private overlayText!: Phaser.GameObjects.Text;

  private clockOffset = 0;
  private deadline: number | null = null;
  private pairs: readonly Pair[] = [];
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
    this.latest = null;
    this.queue = Promise.resolve();
    this.deadline = null;
    this.pairs = [];
    this.aim = null;
    this.playerRows = [];
    this.playerScores = [];

    this.cameras.main.setBackgroundColor(COLORS.background);
    this.buildField();
    this.buildHud();
    this.buildControls();
    this.buildOverlay();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.updateAim(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.endAim(pointer));
    this.events.once("shutdown", () => this.cleanup());

    this.bindRoom(this.room);
    const initial = data.initialState;
    if (initial !== undefined) this.enqueue(() => this.applyState(initial));
    if (!this.offline) void this.refreshWallet();
  }

  override update(): void {
    const ended = this.latest?.match?.phase === "ENDED";
    if (this.deadline === null || ended) {
      this.timerText.setText("");
      return;
    }
    const remainingMs = this.deadline - (Date.now() + this.clockOffset);
    this.timerText.setText(`${Math.max(0, Math.ceil(remainingMs / 1000))}s`);
  }

  // ---- construction ----

  private buildField(): void {
    const cx = GAME_WIDTH / 2;
    const cy = FIELD_TOP + FIELD_PX_H / 2;
    this.add
      .rectangle(cx, cy, FIELD_PX_W + 48, FIELD_PX_H + 48, 0x5b4128)
      .setStrokeStyle(4, 0x3b2a18);
    this.add.rectangle(cx, cy, FIELD_PX_W + 16, FIELD_PX_H + 16, 0x8a6a45);
    for (let i = 0; i < 28; i++) {
      const x = FIELD_LEFT + ((i * 97) % FIELD_PX_W);
      const y = FIELD_TOP + ((i * 61) % FIELD_PX_H);
      this.add.image(x, y, "tile").setAlpha(0.35).setScale(0.6);
    }
    this.pairsGfx = this.add.graphics().setDepth(1);
    this.aimGfx = this.add.graphics().setDepth(10);
  }

  private buildHud(): void {
    createPanel(this, GAME_WIDTH / 2, 140, 680, 260);
    this.potText = this.add.text(48, 44, "", TEXT_STYLES.body).setOrigin(0, 0.5);
    this.coinsText = this.add.text(GAME_WIDTH - 48, 44, "", TEXT_STYLES.body).setOrigin(1, 0.5);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const y = HUD_ROW_Y + i * HUD_ROW_H;
      this.playerRows.push(this.add.text(64, y, "", TEXT_STYLES.body).setOrigin(0, 0.5));
      this.playerScores.push(
        this.add.text(GAME_WIDTH - 64, y, "", TEXT_STYLES.body).setOrigin(1, 0.5),
      );
    }
    this.turnText = this.add.text(GAME_WIDTH / 2, 302, "", TEXT_STYLES.heading).setOrigin(0.5);
    this.timerText = this.add
      .text(GAME_WIDTH / 2, 350, "", { ...TEXT_STYLES.heading, color: "#ffd166" })
      .setOrigin(0.5);
  }

  private buildControls(): void {
    const cx = GAME_WIDTH / 2;
    this.hintText = this.add
      .text(cx, FIELD_TOP + FIELD_PX_H + 62, "", TEXT_STYLES.muted)
      .setOrigin(0.5);
    this.throwBtn = createButton(this, cx, 1010, t("throw"), () => this.sendThrow());
    this.throwBtn.container.setVisible(false);
    createButton(this, cx, GAME_HEIGHT - 90, t("leave"), () => this.leaveToLobby(), {
      width: 220,
      height: 56,
      color: COLORS.secondary,
      hoverColor: COLORS.secondaryHover,
    });
  }

  private buildOverlay(): void {
    const bg = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.75,
    );
    this.overlayText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "", TEXT_STYLES.heading)
      .setOrigin(0.5)
      .setWordWrapWidth(600)
      .setAlign("center");
    this.overlay = this.add.container(0, 0, [bg, this.overlayText]).setDepth(100).setVisible(false);
  }

  // ---- room wiring ----

  private bindRoom(room: GameRoom): void {
    room.onMessage<RoomStateMsg>("state", (state) => this.enqueue(() => this.applyState(state)));
    room.onMessage<EventsMsg>("events", (events) => this.enqueue(() => this.playEvents(events)));
    room.onMessage<TokkaFramesMsg>("tokkaFrames", (frames) =>
      this.enqueue(() => this.replayFrames(frames)),
    );
    room.onMessage<MatchEndedMsg>("matchEnded", (payload) =>
      this.enqueue(() => this.finish(payload)),
    );
    room.onMessage<{ message: string }>("error", (payload) => void this.toast(payload.message));
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
    this.latest = state;
    this.clockOffset = state.serverNow - Date.now();
    this.deadline = state.turnDeadlineAt;
    for (const seat of state.seats) this.nicknames.set(seat.userId, seat.nickname);

    const match = state.match;
    if (match === null) return;
    this.syncGutis(match.gutis);
    this.refreshHud(match);

    const myTurn = match.currentPlayer === this.me && match.phase !== "ENDED";
    this.throwBtn.container.setVisible(myTurn && match.phase === "THROW");
    this.throwBtn.setEnabled(true);
    this.setPairs(myTurn && match.phase === "TOKKA" ? match.pendingTokkas : []);
    this.hintText.setText(myTurn && match.phase === "TOKKA" ? t("tokkaHint") : "");
  }

  private syncGutis(gutis: readonly Guti[]): void {
    const seen = new Set<number>();
    for (const g of gutis) {
      seen.add(g.id);
      const p = toScreen(g.x, g.y);
      const view = this.gutis.get(g.id);
      if (view === undefined) {
        this.gutis.set(g.id, this.createGuti(g.id, g.side, p.x, p.y));
      } else {
        view.setPosition(p.x, p.y);
        view.setSide(g.side);
      }
    }
    for (const [id, view] of this.gutis) {
      if (!seen.has(id)) {
        view.destroy();
        this.gutis.delete(id);
      }
    }
  }

  private createGuti(id: number, side: Side, x: number, y: number): GutiView {
    const view = new GutiView(this, id, side, x, y);
    view.container.on("pointerdown", (pointer: Phaser.Input.Pointer) =>
      this.beginAim(view, pointer),
    );
    return view;
  }

  private refreshHud(match: MatchStateMsg): void {
    this.potText.setText(`${t("potLabel")}: ${match.pot}`);
    this.coinsText.setText(`${t("coins")}: ${getSession().coins}`);

    match.players.forEach((id, i) => {
      const row = this.playerRows[i];
      const score = this.playerScores[i];
      if (row === undefined || score === undefined) return;
      const current = id === match.currentPlayer;
      const name = this.nicknames.get(id) ?? id.slice(0, 6);
      const suffix = id === this.me ? ` (${t("you")})` : "";
      const color = current ? "#ffd166" : COLORS.textLight;
      row.setText(`${current ? "▶ " : "   "}${name}${suffix}`).setColor(color);
      score.setText(`${match.scores[id] ?? 0} / ${match.pot}`).setColor(color);
    });
    for (let i = match.players.length; i < MAX_PLAYERS; i++) {
      this.playerRows[i]?.setText("");
      this.playerScores[i]?.setText("");
    }

    const currentName = this.nicknames.get(match.currentPlayer) ?? match.currentPlayer.slice(0, 6);
    this.turnText.setText(
      match.currentPlayer === this.me ? t("yourTurn") : `${currentName}${t("turnOf")}`,
    );
  }

  private async refreshWallet(): Promise<void> {
    try {
      const wallet = await fetchWallet(getSession().token);
      updateBalance(wallet.coins, wallet.winPoints);
      if (this.alive) this.coinsText.setText(`${t("coins")}: ${wallet.coins}`);
    } catch {
      // keep the balance the lobby loaded
    }
  }

  // ---- events / animation ----

  private async playEvents(events: EventsMsg): Promise<void> {
    for (const event of events) {
      switch (event.type) {
        case "THROW":
          await this.playThrow(event.player, event.result.gutis);
          await this.toast(`${event.result.flatCount}F`);
          break;
        case "SCORE":
          await this.toast(`+${event.points}`);
          break;
        case "DIE":
          await this.toast(t("die"));
          break;
        case "WIN":
          await this.toast(event.reason === "ZERO_FLAT" ? t("instantWin") : t("winToast"));
          break;
        case "TOKKA":
        case "TURN":
          break;
      }
    }
  }

  /** Tosses the stack in from the thrower's side, then settles onto the server positions/sides. */
  private async playThrow(player: string, gutis: readonly Guti[]): Promise<void> {
    const players = this.latest?.match?.players ?? [];
    const fromLeft = Math.max(0, players.indexOf(player)) % 2 === 0;
    const originX = fromLeft ? FIELD_LEFT - 60 : FIELD_LEFT + FIELD_PX_W + 60;
    const originY = FIELD_TOP + FIELD_PX_H / 2;

    this.setPairs([]);
    const flights = gutis.map((g, i) => {
      let view = this.gutis.get(g.id);
      if (view === undefined) {
        view = this.createGuti(g.id, g.side, originX, originY);
        this.gutis.set(g.id, view);
      }
      view.setPosition(originX, originY - i * 10);
      const target = toScreen(g.x, g.y);
      return this.flyGuti(view, target.x, target.y, g.side, i * 60);
    });
    await Promise.all(flights);
  }

  private flyGuti(view: GutiView, x: number, y: number, side: Side, delay: number): Promise<void> {
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
        angle: 720,
        duration: THROW_MS,
        delay,
        ease: "Cubic.easeOut",
        onUpdate: (tween) => {
          if (tween.progress > 0.6) view.setSide(side);
        },
        onComplete: () => {
          view.container.setAngle(0);
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
    this.setPairs([]);
    this.aimGfx.clear();
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
    const label = this.add
      .text(GAME_WIDTH / 2, FIELD_TOP + FIELD_PX_H / 2, text, TEXT_STYLES.title)
      .setOrigin(0.5)
      .setDepth(20)
      .setStroke("#000000", 6);
    return new Promise((resolve) => {
      const done = (): void => {
        label.destroy();
        resolve();
      };
      this.tweens.add({
        targets: label,
        y: label.y - 90,
        alpha: 0,
        duration: TOAST_MS,
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

  private setPairs(pairs: readonly Pair[]): void {
    this.pairs = pairs;
    this.pairsGfx.clear();
    const inPair = new Set<number>();
    for (const [a, b] of pairs) {
      inPair.add(a);
      inPair.add(b);
    }
    for (const [id, view] of this.gutis) view.setHighlight(inPair.has(id) ? "candidate" : "none");
    this.pairsGfx.lineStyle(4, 0xffd166, 0.55);
    for (const [a, b] of pairs) {
      const va = this.gutis.get(a);
      const vb = this.gutis.get(b);
      if (va !== undefined && vb !== undefined) this.pairsGfx.lineBetween(va.x, va.y, vb.x, vb.y);
    }
  }

  private beginAim(view: GutiView, pointer: Phaser.Input.Pointer): void {
    if (this.aim !== null) return;
    if (!this.pairs.some(([a, b]) => a === view.id || b === view.id)) return;
    this.aim = { shooter: view, pointerId: pointer.id };
    view.setHighlight("active");
    this.hintText.setText(t("aimHint"));
  }

  private updateAim(pointer: Phaser.Input.Pointer): void {
    if (this.aim === null || pointer.id !== this.aim.pointerId) return;
    const s = this.aim.shooter;
    this.aimGfx.clear();
    this.aimGfx.lineStyle(6, 0xffd166, 0.9).lineBetween(s.x, s.y, pointer.worldX, pointer.worldY);
    this.aimGfx.fillStyle(0xffd166, 0.9).fillCircle(pointer.worldX, pointer.worldY, 8);
  }

  private endAim(pointer: Phaser.Input.Pointer): void {
    if (this.aim === null || pointer.id !== this.aim.pointerId) return;
    const shooter = this.aim.shooter;
    this.aim = null;
    this.aimGfx.clear();
    shooter.setHighlight("candidate");

    const dx = pointer.worldX - shooter.x;
    const dy = pointer.worldY - shooter.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      this.hintText.setText(t("tokkaHint"));
      return;
    }
    const targetId = this.pickTarget(shooter, dx / dist, dy / dist);
    if (targetId === null) {
      this.hintText.setText(t("aimCancelled"));
      return;
    }
    const power = Phaser.Math.Clamp((dist / FIELD_SCALE) * 4, 40, DEFAULT_CONFIG.maxFlickPower);
    this.setPairs([]);
    this.hintText.setText("");
    this.room.send("TOKKA", { shooterId: shooter.id, targetId, flick: { dx, dy, power } });
  }

  /** Among the shooter's eligible partners, the one most in line with the flick direction. */
  private pickTarget(shooter: GutiView, ux: number, uy: number): number | null {
    let best: number | null = null;
    let bestDot = 0.2;
    for (const [a, b] of this.pairs) {
      const other = a === shooter.id ? b : b === shooter.id ? a : null;
      if (other === null) continue;
      const view = this.gutis.get(other);
      if (view === undefined) continue;
      const tx = view.x - shooter.x;
      const ty = view.y - shooter.y;
      const len = Math.hypot(tx, ty) || 1;
      const dot = (tx / len) * ux + (ty / len) * uy;
      if (dot > bestDot) {
        bestDot = dot;
        best = other;
      }
    }
    return best;
  }

  // ---- end / disconnect ----

  private finish(payload: MatchEndedMsg): void {
    const delta = payload.settlement.deltas[this.me] ?? 0;
    this.room.removeAllListeners();
    this.scene.start("Result", { room: this.room, winner: payload.winner, delta });
  }

  private async handleDisconnect(): Promise<void> {
    if (!this.alive || this.offline) return;
    this.showOverlay(t("reconnecting"));
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
    this.showOverlay(t("reconnectFailed"));
    await new Promise((r) => setTimeout(r, 1500));
    if (this.alive) this.scene.start("Lobby");
  }

  private showOverlay(text: string): void {
    this.overlayText.setText(text);
    this.overlay.setVisible(true);
  }

  private hideOverlay(): void {
    this.overlay.setVisible(false);
  }

  private leaveToLobby(): void {
    void this.room.leave(true);
    this.scene.start("Lobby");
  }

  private cleanup(): void {
    this.alive = false;
    this.aim = null;
    this.room.removeAllListeners();
    this.input.removeAllListeners();
    this.gutis.clear();
  }
}
