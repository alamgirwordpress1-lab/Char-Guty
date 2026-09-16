import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, LANDSCAPE } from "../config.js";
import { COLOR, TEXT } from "../ui/theme.js";
import { glossyButton, panel } from "../ui/widgets.js";
import type { CoachStep } from "./tutorial.js";

/** What the coach needs from the Game scene. */
export interface CoachHost {
  readonly throwButton: { readonly x: number; readonly y: number; readonly height: number };
  gutiPosition(id: number): { readonly x: number; readonly y: number } | null;
  /** The lesson is over: on to the game proper. */
  finish(): void;
}

const DEPTH = 150;
/** How far the ghost finger pulls a guti back, in screen px. */
const DEMO_PULL = 110;
/** The coach's words: above the board in portrait, in the strip under it in landscape. */
const TIP = LANDSCAPE
  ? { x: GAME_WIDTH / 2, y: 672, width: 800, height: 88 }
  : { x: GAME_WIDTH / 2, y: 250, width: 680, height: 120 };

const SAY: Record<Exclude<CoachStep["step"], "done">, string> = {
  throw: "Tap THROW to toss the four gutis",
  tokka:
    "2 landed flat, so you get 2 tokkas! Drag a guti back and let go to flick it into another one",
  again: "+1 point - both gutis leave the mat. One more tokka: hit the last two together",
  miss: "Missed! In a real game that ends your turn. Aim at a guti and pull back further",
};

/** The rest of the rules, shown on the closing card: each throw as the gutis would land. */
const THROWS: readonly (readonly [sides: string, label: string])[] = [
  ["FFRR", "1-3 flat: 2 tokkas"],
  ["FFFF", "All flat: +4 points"],
  ["RRRR", "All round: you win!"],
];

/**
 * Talks the player through the tutorial: a line of text for each step, an arrow at THROW,
 * a ghost finger acting a tokka out, and at the end a card with the rest of the rules.
 */
export class TutorialCoach {
  private readonly tip: Phaser.GameObjects.Container;
  private readonly tipText: Phaser.GameObjects.Text;
  private pointer: Phaser.GameObjects.Container | null = null;
  private tweens: Phaser.Tweens.Tween[] = [];
  private last: CoachStep | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: CoachHost,
  ) {
    this.tipText = scene.add
      .text(0, 0, "", { ...TEXT.body, align: "center", wordWrap: { width: TIP.width - 60 } })
      .setOrigin(0.5);
    this.tip = scene.add
      .container(TIP.x, TIP.y, [panel(scene, 0, 0, TIP.width, TIP.height, "glass"), this.tipText])
      .setDepth(DEPTH)
      .setVisible(false);
  }

  show(step: CoachStep): void {
    this.last = step;
    this.clearPointer();
    if (step.step === "done") {
      this.tip.setVisible(false);
      this.showRules();
      return;
    }
    this.tipText.setText(SAY[step.step]);
    this.tip.setVisible(true);
    if (step.step === "throw") this.pointAtThrow();
    else this.actOutTokka(step.shooterId, step.targetId);
  }

  /** The player let go without a real pull: act it out again. */
  remind(): void {
    if (this.last !== null && this.last.step !== "done") this.show(this.last);
  }

  /** A guti is in hand: stop acting it out. */
  onAim(): void {
    this.clearPointer();
  }

  private pointAtThrow(): void {
    const { x, y, height } = this.host.throwButton;
    const arrow = this.scene.add
      .triangle(0, 0, 0, 0, 48, 0, 24, 36, COLOR.gold)
      .setStrokeStyle(4, COLOR.navy);
    const holder = this.scene.add.container(x, y - height / 2 - 44, [arrow]).setDepth(DEPTH);
    this.pointer = holder;
    this.tweens.push(
      this.scene.tweens.add({
        targets: holder,
        y: holder.y - 18,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      }),
    );
  }

  /** A ghost finger pulls the shooter back, away from its target, and lets go - over and over. */
  private actOutTokka(shooterId: number, targetId: number): void {
    const from = this.host.gutiPosition(shooterId);
    const to = this.host.gutiPosition(targetId);
    if (from === null || to === null) return;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const lines = this.scene.add.graphics();
    const finger = this.scene.add
      .circle(from.x, from.y, 20, 0xffffff, 0.85)
      .setStrokeStyle(4, COLOR.navy, 0.5);
    this.pointer = this.scene.add.container(0, 0, [lines, finger]).setDepth(DEPTH);
    const pull = { t: 0 };
    this.tweens.push(
      this.scene.tweens.add({
        targets: pull,
        t: 1,
        duration: 900,
        hold: 400,
        repeatDelay: 600,
        repeat: -1,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          const x = from.x - ux * DEMO_PULL * pull.t;
          const y = from.y - uy * DEMO_PULL * pull.t;
          finger.setPosition(x, y);
          lines.clear();
          lines.lineStyle(4, 0xffffff, 0.6).lineBetween(from.x, from.y, x, y);
          // Pulled back one way, the guti flies the other: straight at its target.
          const reach = 36 + 60 * pull.t;
          lines
            .lineStyle(8, COLOR.gold, 0.95)
            .lineBetween(
              from.x + ux * 30,
              from.y + uy * 30,
              from.x + ux * reach,
              from.y + uy * reach,
            );
        },
      }),
    );
  }

  private clearPointer(): void {
    for (const tween of this.tweens) tween.stop();
    this.tweens = [];
    this.pointer?.destroy();
    this.pointer = null;
  }

  private showRules(): void {
    const { scene } = this;
    const dim = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLOR.deepNavy, 0.8)
      .setInteractive();
    const card = scene.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2)
      .setScale(LANDSCAPE ? 0.88 : 1);
    card.add([
      panel(scene, 0, 0, 620, 720, "card"),
      scene.add
        .text(0, -290, "YOU'RE READY!", { ...TEXT.title, color: COLOR.goldText })
        .setOrigin(0.5),
    ]);
    THROWS.forEach(([sides, label], row) => {
      const y = -180 + row * 100;
      [...sides].forEach((side, i) => {
        card.add(
          scene.add
            .image(-250 + i * 56, y, side === "F" ? "guti-flat" : "guti-round")
            .setDisplaySize(64, 32)
            .setAngle(i % 2 === 0 ? -14 : 14),
        );
      });
      card.add(scene.add.text(-30, y, label, TEXT.heading).setOrigin(0, 0.5));
    });
    card.add(
      scene.add
        .text(0, 130, "Miss a tokka and your turn passes.\nFirst to the target score wins!", {
          ...TEXT.body,
          align: "center",
        })
        .setOrigin(0.5),
    );
    const play = glossyButton(scene, 0, 270, "LET'S PLAY", () => this.host.finish(), {
      width: 420,
      height: 104,
      color: "green",
    });
    card.add(play.container);
    scene.add.container(0, 0, [dim, card]).setDepth(DEPTH + 10);
  }
}
