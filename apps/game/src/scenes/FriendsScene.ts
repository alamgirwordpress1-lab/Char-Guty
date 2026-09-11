import Phaser from "phaser";
import { GAME_WIDTH } from "../config.js";
import { openFreeCoins } from "../ui/freeCoins.js";
import { FONT, TEXT } from "../ui/theme.js";
import { glossyButton, menuBackground, notify, panel, screenHeader } from "../ui/widgets.js";
import type { ArenaSceneData, MatchmakingSceneData } from "./flow.js";

const ROOM_CODE = /^[A-Z0-9]{6}$/;

export class FriendsScene extends Phaser.Scene {
  constructor() {
    super("Friends");
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    menuBackground(this);
    const coins = screenHeader(
      this,
      "Play with Friends",
      () => this.scene.start("Home"),
      () => openFreeCoins(this, (balance) => coins.setCoins(balance)),
    );

    panel(this, cx, 390, 640, 360, "card");
    this.add.image(cx, 270, "icon-users").setDisplaySize(96, 96);
    this.add.text(cx, 350, "Create a Room", TEXT.title).setOrigin(0.5);
    this.add
      .text(cx, 418, "Pick the stakes, then share the\nroom code with your friends", {
        ...TEXT.body,
        align: "center",
      })
      .setOrigin(0.5);
    glossyButton(
      this,
      cx,
      510,
      "CREATE ROOM",
      () => this.scene.start("Arena", { mode: "friends" } satisfies ArenaSceneData),
      { width: 400, height: 96, color: "orange" },
    );

    panel(this, cx, 820, 640, 380, "card");
    this.add.text(cx, 700, "Join a Room", TEXT.title).setOrigin(0.5);
    this.add.text(cx, 756, "Enter the code your friend shared", TEXT.body).setOrigin(0.5);
    const input = codeInput();
    this.add.dom(cx, 842, input);
    glossyButton(this, cx, 944, "JOIN ROOM", () => this.join(input.value), {
      width: 400,
      height: 96,
      color: "green",
    });
  }

  private join(raw: string): void {
    const code = raw.trim().toUpperCase();
    if (!ROOM_CODE.test(code)) {
      notify(this, "Enter the 6-character room code");
      return;
    }
    this.scene.start("Matchmaking", {
      mode: "friends",
      playerCount: 2,
      pot: null,
      code,
    } satisfies MatchmakingSceneData);
  }
}

function codeInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 6;
  input.placeholder = "CODE";
  input.autocomplete = "off";
  Object.assign(input.style, {
    width: "360px",
    height: "80px",
    boxSizing: "border-box",
    fontFamily: FONT,
    fontSize: "40px",
    fontWeight: "700",
    letterSpacing: "8px",
    textAlign: "center",
    textTransform: "uppercase",
    color: "#ffffff",
    background: "#0a1d4d",
    border: "4px solid #8fb8ff",
    borderRadius: "18px",
    outline: "none",
  });
  return input;
}
