import { potSchema } from "@char-guty/shared";
import type { JoinOptions } from "@char-guty/shared";
import Phaser from "phaser";
import type { Room } from "colyseus.js";
import { GAME_WIDTH } from "../config.js";
import { t } from "../i18n/index.js";
import { ads } from "../services/ads.js";
import {
  createFriendRoom,
  fetchWallet,
  findRoomByCode,
  joinRandomMatch,
  joinRoomById,
} from "../services/net.js";
import type { RoomStateMsg } from "../services/roomState.js";
import { getSession, updateBalance } from "../state/session.js";
import { COLORS, createButton, createChip, createPanel, TEXT_STYLES } from "../ui/kit.js";
import type { ButtonHandle } from "../ui/kit.js";

/** pot ∈ {100,200,300,400,500}, must divide evenly by player count - see CLAUDE.md. */
const POT_VALUES = [100, 200, 300, 400, 500] as const;
const PLAYER_COUNTS = [2, 3, 4] as const;

export class LobbyScene extends Phaser.Scene {
  private playerCount: (typeof PLAYER_COUNTS)[number] = 2;
  private pot: number = POT_VALUES[0];

  private coinsText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private watchAdButton!: ButtonHandle;
  private playerCountChips: ButtonHandle[] = [];
  private potChipsContainer!: Phaser.GameObjects.Container;
  private potChips: ButtonHandle[] = [];
  private mainButtons: ButtonHandle[] = [];

  private friendPanel!: Phaser.GameObjects.Container;
  private friendCodeText!: Phaser.GameObjects.Text;
  private codeInputElement!: Phaser.GameObjects.DOMElement;

  constructor() {
    super("Lobby");
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.playerCountChips = [];
    this.potChips = [];
    this.mainButtons = [];

    this.add.text(GAME_WIDTH / 2, 70, t("lobbyTitle"), TEXT_STYLES.title).setOrigin(0.5);
    this.coinsText = this.add.text(GAME_WIDTH / 2, 130, "", TEXT_STYLES.heading).setOrigin(0.5);
    this.watchAdButton = createButton(
      this,
      GAME_WIDTH / 2,
      180,
      t("watchAd"),
      () => {
        void this.watchAdFlow();
      },
      { width: 360, height: 60, color: COLORS.secondary, hoverColor: COLORS.secondaryHover },
    );
    this.refreshBalanceDisplay();
    void this.reloadBalance();

    this.buildPlayerCountRow(300);
    this.buildPotRow(450);
    this.statusText = this.add.text(GAME_WIDTH / 2, 540, "", TEXT_STYLES.muted).setOrigin(0.5);
    this.buildActions(620);
    this.buildLeaderboardButton(830);
    this.buildFriendPanel();
  }

  private currentStake(): number {
    return this.pot / this.playerCount;
  }

  private refreshBalanceDisplay(): void {
    const session = getSession();
    this.coinsText.setText(`${t("coins")}: ${session.coins}`);
    this.watchAdButton.container.setVisible(session.coins < this.currentStake());
  }

  private async reloadBalance(): Promise<void> {
    const session = getSession();
    try {
      const wallet = await fetchWallet(session.token);
      updateBalance(wallet.coins, wallet.winPoints);
      this.refreshBalanceDisplay();
    } catch {
      // keep showing the last known balance
    }
  }

  private async watchAdFlow(): Promise<void> {
    this.watchAdButton.setEnabled(false);
    this.statusText.setText(t("watchingAd"));
    const result = await ads.showRewarded();
    this.refreshBalanceDisplay();
    this.watchAdButton.setEnabled(true);
    this.statusText.setText(result === "rewarded" ? t("adRewarded") : t("adFailed"));
  }

  private buildLeaderboardButton(y: number): void {
    createButton(
      this,
      GAME_WIDTH / 2,
      y,
      t("leaderboardTitle"),
      () => this.scene.start("Leaderboard"),
      {
        width: 300,
        height: 60,
        color: COLORS.secondary,
        hoverColor: COLORS.secondaryHover,
      },
    );
  }

  private buildPlayerCountRow(y: number): void {
    this.add.text(GAME_WIDTH / 2, y - 46, t("playersLabel"), TEXT_STYLES.muted).setOrigin(0.5);
    const spacing = 160;
    const startX = GAME_WIDTH / 2 - spacing;
    PLAYER_COUNTS.forEach((count, i) => {
      const chip = createChip(this, startX + i * spacing, y, String(count), () => {
        this.playerCount = count;
        this.syncPlayerCountChips();
        this.rebuildPotRow();
        this.refreshBalanceDisplay();
      });
      chip.setEnabled(count === this.playerCount);
      this.playerCountChips.push(chip);
    });
  }

  private syncPlayerCountChips(): void {
    this.playerCountChips.forEach((chip, i) =>
      chip.setEnabled(PLAYER_COUNTS[i] === this.playerCount),
    );
  }

  private validPots(): number[] {
    return POT_VALUES.filter((pot) => pot % this.playerCount === 0);
  }

  private buildPotRow(y: number): void {
    this.add.text(GAME_WIDTH / 2, y - 46, t("potLabel"), TEXT_STYLES.muted).setOrigin(0.5);
    this.potChipsContainer = this.add.container(0, y);
    this.rebuildPotRow();
  }

  private rebuildPotRow(): void {
    this.potChipsContainer.removeAll(true);
    this.potChips = [];

    const pots = this.validPots();
    if (!pots.includes(this.pot)) this.pot = pots[0] ?? POT_VALUES[0];

    const width = 120;
    const totalWidth = pots.length * width;
    const startX = GAME_WIDTH / 2 - totalWidth / 2 + width / 2;

    pots.forEach((pot, i) => {
      const chip = createChip(
        this,
        startX + i * width,
        0,
        String(pot),
        () => {
          this.pot = pot;
          this.syncPotChips();
          this.refreshBalanceDisplay();
        },
        { width: width - 12 },
      );
      chip.setEnabled(pot === this.pot);
      this.potChipsContainer.add(chip.container);
      this.potChips.push(chip);
    });
  }

  private syncPotChips(): void {
    const pots = this.validPots();
    this.potChips.forEach((chip, i) => chip.setEnabled(pots[i] === this.pot));
  }

  private buildActions(y: number): void {
    this.mainButtons.push(
      createButton(this, GAME_WIDTH / 2, y, t("randomMatch"), () => {
        void this.startRandomMatch();
      }),
    );
    this.mainButtons.push(
      createButton(
        this,
        GAME_WIDTH / 2,
        y + 110,
        t("playWithFriends"),
        () => {
          this.friendPanel.setVisible(!this.friendPanel.visible);
        },
        { color: COLORS.secondary, hoverColor: COLORS.secondaryHover },
      ),
    );
  }

  private joinOptions(mode: "friend" | "random"): JoinOptions {
    const session = getSession();
    return {
      token: session.token,
      nickname: session.nickname,
      mode,
      playerCount: this.playerCount,
      pot: potSchema.parse(this.pot),
    };
  }

  private async startRandomMatch(): Promise<void> {
    this.setBusy(true, t("waiting"));
    try {
      const room = await joinRandomMatch(this.joinOptions("random"));
      this.watchUntilMatchStarts(room);
    } catch (err) {
      this.setBusy(false, err instanceof Error ? err.message : String(err));
    }
  }

  /** Transitions to Game only once the room actually reaches PLAYING (enough seats filled). */
  private watchUntilMatchStarts(room: Room): void {
    room.onMessage<RoomStateMsg>("state", (state) => {
      if (state.code !== null) {
        this.friendCodeText.setText(`${t("roomCode")}: ${state.code}`);
      }
      this.statusText.setText(`${t("waiting")} (${state.seats.length}/${this.playerCount})`);
      if (state.roomPhase === "PLAYING") {
        // This handler would otherwise keep firing (and restarting Game) on every later state.
        room.removeAllListeners();
        this.scene.start("Game", { room, initialState: state });
      }
    });
  }

  private buildFriendPanel(): void {
    const panelY = 1050;
    const panel = createPanel(this, GAME_WIDTH / 2, panelY, 640, 300);
    const title = this.add
      .text(GAME_WIDTH / 2, panelY - 120, t("playWithFriends"), TEXT_STYLES.heading)
      .setOrigin(0.5);

    const createBtn = createButton(
      this,
      GAME_WIDTH / 2 - 150,
      panelY - 40,
      t("createRoom"),
      () => {
        void this.createFriendRoomFlow();
      },
      { width: 260, height: 76 },
    );
    this.friendCodeText = this.add
      .text(GAME_WIDTH / 2, panelY + 20, "", TEXT_STYLES.body)
      .setOrigin(0.5);

    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 6;
    input.placeholder = t("enterCode");
    input.style.width = "220px";
    input.style.height = "48px";
    input.style.fontSize = "20px";
    input.style.textAlign = "center";
    input.style.textTransform = "uppercase";
    this.codeInputElement = this.add.dom(GAME_WIDTH / 2 - 150, panelY + 80, input);

    const joinBtn = createButton(
      this,
      GAME_WIDTH / 2 + 150,
      panelY + 80,
      t("join"),
      () => {
        void this.joinByCodeFlow(input.value);
      },
      { width: 220, height: 64 },
    );

    const backBtn = createButton(
      this,
      GAME_WIDTH / 2,
      panelY + 150,
      t("back"),
      () => this.friendPanel.setVisible(false),
      { width: 200, height: 56, color: COLORS.secondary, hoverColor: COLORS.secondaryHover },
    );

    this.friendPanel = this.add.container(0, 0, [
      panel,
      title,
      createBtn.container,
      this.friendCodeText,
      this.codeInputElement,
      joinBtn.container,
      backBtn.container,
    ]);
    this.friendPanel.setVisible(false);
  }

  private async createFriendRoomFlow(): Promise<void> {
    this.setBusy(true, t("waiting"));
    try {
      const room = await createFriendRoom(this.joinOptions("friend"));
      this.watchUntilMatchStarts(room);
    } catch (err) {
      this.setBusy(false, err instanceof Error ? err.message : String(err));
    }
  }

  private async joinByCodeFlow(code: string): Promise<void> {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      this.statusText.setText(t("enterCode"));
      return;
    }
    this.setBusy(true, t("waiting"));
    try {
      const session = getSession();
      const roomId = await findRoomByCode(session.token, trimmed);
      const room = await joinRoomById(roomId, this.joinOptions("friend"));
      this.watchUntilMatchStarts(room);
    } catch (err) {
      this.setBusy(false, err instanceof Error ? err.message : String(err));
    }
  }

  private setBusy(busy: boolean, message: string): void {
    this.statusText.setText(message);
    for (const button of this.mainButtons) button.setEnabled(!busy);
  }
}
