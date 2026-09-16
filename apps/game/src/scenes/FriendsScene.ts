import Phaser from "phaser";
import { GAME_WIDTH, LANDSCAPE } from "../config.js";
import { freeCoinsOffered, openFreeCoins } from "../ui/freeCoins.js";
import { FONT, TEXT } from "../ui/theme.js";
import { glossyButton, menuBackground, notify, panel, screenHeader } from "../ui/widgets.js";
import type { ArenaSceneData, MatchmakingSceneData } from "./flow.js";

const ROOM_CODE = /^[A-Z0-9]{6}$/;

/** Portrait stacks the two cards, landscape sets them side by side; offsets are from each card's centre. */
const LAYOUT = LANDSCAPE
  ? {
      create: { x: 340, y: 420, width: 560, height: 460 },
      join: { x: 940, y: 420, width: 560, height: 460 },
      icon: -150,
      createTitle: -60,
      createText: 20,
      createButton: 140,
      joinTitle: -150,
      joinText: -90,
      input: 10,
      joinButton: 140,
    }
  : {
      create: { x: GAME_WIDTH / 2, y: 390, width: 640, height: 360 },
      join: { x: GAME_WIDTH / 2, y: 820, width: 640, height: 380 },
      icon: -120,
      createTitle: -40,
      createText: 28,
      createButton: 120,
      joinTitle: -120,
      joinText: -64,
      input: 22,
      joinButton: 124,
    };

export class FriendsScene extends Phaser.Scene {
  constructor() {
    super("Friends");
  }

  create(): void {
    menuBackground(this);
    const coins = screenHeader(
      this,
      "Play with Friends",
      () => this.scene.start("Home"),
      freeCoinsOffered
        ? () => openFreeCoins(this, (balance) => coins.setCoins(balance))
        : undefined,
    );

    const { create, join } = LAYOUT;
    panel(this, create.x, create.y, create.width, create.height, "card");
    this.add.image(create.x, create.y + LAYOUT.icon, "icon-users").setDisplaySize(96, 96);
    this.add
      .text(create.x, create.y + LAYOUT.createTitle, "Create a Room", TEXT.title)
      .setOrigin(0.5);
    this.add
      .text(
        create.x,
        create.y + LAYOUT.createText,
        "Pick the stakes, then share the\nroom code with your friends",
        { ...TEXT.body, align: "center" },
      )
      .setOrigin(0.5);
    glossyButton(
      this,
      create.x,
      create.y + LAYOUT.createButton,
      "CREATE ROOM",
      () => this.scene.start("Arena", { mode: "friends" } satisfies ArenaSceneData),
      { width: 400, height: 96, color: "orange" },
    );

    panel(this, join.x, join.y, join.width, join.height, "card");
    this.add.text(join.x, join.y + LAYOUT.joinTitle, "Join a Room", TEXT.title).setOrigin(0.5);
    this.add
      .text(join.x, join.y + LAYOUT.joinText, "Enter the code your friend shared", TEXT.body)
      .setOrigin(0.5);
    const input = codeInput();
    this.add.dom(join.x, join.y + LAYOUT.input, input);
    glossyButton(
      this,
      join.x,
      join.y + LAYOUT.joinButton,
      "JOIN ROOM",
      () => this.join(input.value),
      { width: 400, height: 96, color: "green" },
    );
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
