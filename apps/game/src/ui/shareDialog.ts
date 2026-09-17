import type Phaser from "phaser";
import { LANDSCAPE } from "../config.js";
import { canShareToApps, onPhone, shareToApps } from "../services/platform.js";
import { COLOR, TEXT } from "./theme.js";
import { dialog, glossyButton, notify, pressable } from "./widgets.js";
import type { Dialog } from "./widgets.js";

interface ShareApp {
  readonly name: string;
  /** Texture key of the app's badge. */
  readonly badge: string;
  readonly open: () => void;
}

/** Portrait sets the apps out three to a row; landscape has room for them all in one. */
const SHEET = LANDSCAPE
  ? { width: 880, perRow: 6, column: 130, inner: 600 }
  : { width: 640, perRow: 3, column: 170, inner: 560 };
/** Where each part sits, measured down from the top of the sheet. */
const Y = { subtitle: 122, messenger: 218, firstRow: 352, rowStep: 150, wellBelowRows: 188 };
const WELL_HEIGHT = 124;
const BOTTOM_MARGIN = 50;
const BADGE_SIZE = 96;
const COPIED_MS = 1600;

/** The invite as it lands in a chat: what it is, the link that opens the room, and its code. */
export function inviteMessage(code: string, link: string): string {
  return `🎮 Let's play Char Guty together!\nJoin my room: ${link}\nRoom code: ${code}`;
}

/**
 * The Invite Friends sheet. Messenger comes first and biggest, being where most players send
 * their invites; then every other app with a way in, the device's own share sheet for all the
 * rest (imo, Instagram and so on), and the room code with its link to copy.
 */
export function shareInvite(scene: Phaser.Scene, code: string, link: string): void {
  const message = inviteMessage(code, link);
  const { messenger, others } = shareApps(scene, code, link, message);
  const rows = Math.ceil(others.length / SHEET.perRow);
  const wellY = Y.firstRow + (rows - 1) * Y.rowStep + Y.wellBelowRows;
  const height = wellY + WELL_HEIGHT / 2 + BOTTOM_MARGIN;
  const top = -height / 2;

  const sheet = dialog(scene, "Invite Friends", SHEET.width, height);
  const subtitle = scene.add
    .text(0, top + Y.subtitle, "Send your friends the link to this room", {
      ...TEXT.body,
      color: COLOR.muted,
    })
    .setOrigin(0.5);
  const messengerButton = glossyButton(
    scene,
    0,
    top + Y.messenger,
    "SEND IN MESSENGER",
    messenger.open,
    { width: SHEET.inner, height: 92, color: "blue", icon: messenger.badge, fontSize: 30 },
  );
  sheet.add(subtitle, messengerButton.container);

  others.forEach((app, i) => {
    const row = Math.floor(i / SHEET.perRow);
    const inRow = Math.min(SHEET.perRow, others.length - row * SHEET.perRow);
    const x = ((i % SHEET.perRow) - (inRow - 1) / 2) * SHEET.column;
    const badge = scene.add.image(0, 0, app.badge).setDisplaySize(BADGE_SIZE, BADGE_SIZE);
    const name = scene.add
      .text(0, BADGE_SIZE / 2 + 24, app.name, { ...TEXT.small, color: COLOR.white })
      .setOrigin(0.5);
    const item = scene.add
      .container(x, top + Y.firstRow + row * Y.rowStep, [badge, name])
      .setSize(SHEET.column, BADGE_SIZE + 64);
    pressable(item, app.open);
    sheet.add(item);
  });

  addCodeWell(scene, sheet, top + wellY, code, link);
}

/** The room code, for a friend who would rather type it in, and the link to paste anywhere. */
function addCodeWell(
  scene: Phaser.Scene,
  sheet: Dialog,
  y: number,
  code: string,
  link: string,
): void {
  const half = SHEET.inner / 2;
  const well = scene.add.graphics();
  well
    .fillStyle(COLOR.deepNavy, 0.5)
    .fillRoundedRect(-half, y - WELL_HEIGHT / 2, SHEET.inner, WELL_HEIGHT, 26);
  well
    .lineStyle(2, 0xffffff, 0.12)
    .strokeRoundedRect(-half, y - WELL_HEIGHT / 2, SHEET.inner, WELL_HEIGHT, 26);
  const label = scene.add.text(-half + 32, y - 26, "ROOM CODE", TEXT.small).setOrigin(0, 0.5);
  const codeText = scene.add
    .text(-half + 32, y + 18, code, { ...TEXT.title, fontSize: "46px", color: COLOR.goldText })
    .setOrigin(0, 0.5);
  const copy = glossyButton(
    scene,
    half - 130,
    y,
    "COPY LINK",
    () => {
      void copyInvite(scene, code, link).then((copied) => {
        if (!copied || !copy.container.active) return;
        copy.setLabel("COPIED");
        scene.time.delayedCall(COPIED_MS, () => {
          if (copy.container.active) copy.setLabel("COPY LINK");
        });
      });
    },
    { width: 220, height: 84, color: "orange", fontSize: 24 },
  );
  sheet.add(well, label, codeText, copy.container);
}

/**
 * Messenger, and the other apps in the order they go on the sheet. A phone opens each app
 * through its link scheme, which leaves this page and its room where they are; a computer
 * gets each one's web share page.
 */
function shareApps(
  scene: Phaser.Scene,
  code: string,
  link: string,
  message: string,
): { messenger: ShareApp; others: ShareApp[] } {
  const phone = onPhone();
  const text = encodeURIComponent(message);
  const url = encodeURIComponent(link);
  // Telegram and X set the link apart from the words themselves.
  const words = encodeURIComponent(`Let's play Char Guty together! Room code: ${code}`);

  const messenger: ShareApp = {
    name: "Messenger",
    badge: "share-messenger",
    // Its send screen, the chat picker, only exists in the phone app. On a computer the invite
    // is copied, and messenger.com opens for it to be pasted into a chat.
    open: phone
      ? () => openApp(scene, "Messenger", `fb-messenger://share/?link=${url}`)
      : () => void copyAndOpen(scene, "Messenger", "https://www.messenger.com/", message, code),
  };

  const others: ShareApp[] = [
    {
      name: "Facebook",
      badge: "share-facebook",
      open: () => openApp(scene, "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${url}`),
    },
    {
      name: "WhatsApp",
      badge: "share-whatsapp",
      open: () =>
        openApp(
          scene,
          "WhatsApp",
          phone ? `whatsapp://send?text=${text}` : `https://wa.me/?text=${text}`,
        ),
    },
    {
      name: "Telegram",
      badge: "share-telegram",
      open: () =>
        openApp(
          scene,
          "Telegram",
          phone
            ? `tg://msg_url?url=${url}&text=${words}`
            : `https://t.me/share/url?url=${url}&text=${words}`,
        ),
    },
    {
      name: "X",
      badge: "share-x",
      open: () => openApp(scene, "X", `https://twitter.com/intent/tweet?text=${words}&url=${url}`),
    },
    phone
      ? {
          name: "SMS",
          badge: "share-sms",
          open: () => openApp(scene, "SMS", `sms:?&body=${text}`),
        }
      : {
          name: "Email",
          badge: "share-email",
          open: () =>
            openApp(
              scene,
              "Email",
              `mailto:?subject=${encodeURIComponent("Join my Char Guty room")}&body=${text}`,
            ),
        },
  ];
  // The device's own share sheet reaches every app not listed here.
  if (canShareToApps()) {
    others.push({
      name: "More",
      badge: "share-more",
      open: () =>
        void shareToApps("Char Guty", message).then((outcome) => {
          if (outcome === "unavailable" && scene.sys.isActive()) void copyInvite(scene, code, link);
        }),
    });
  }
  return { messenger, others };
}

/**
 * Copies the invite link, and says whether that worked - falling back to the room code.
 * Resolves to whether the link was copied.
 */
export async function copyInvite(
  scene: Phaser.Scene,
  code: string,
  link: string,
): Promise<boolean> {
  const copied = await copyText(link);
  if (!scene.sys.isActive()) return copied;
  notify(
    scene,
    copied
      ? "Invite link copied - paste it in your chat"
      : `Couldn't copy the link - send your friend the room code: ${code}`,
  );
  return copied;
}

/** For an app with no share page: the invite is copied, then the app opens to paste it in. */
async function copyAndOpen(
  scene: Phaser.Scene,
  name: string,
  url: string,
  message: string,
  code: string,
): Promise<void> {
  const copied = await copyText(message);
  if (scene.sys.isActive()) {
    notify(
      scene,
      copied
        ? `Invite copied - paste it in a ${name} chat`
        : `Couldn't copy the invite - send your friend the room code: ${code}`,
    );
  }
  window.open(url, "_blank", "noopener");
}

/**
 * Hands the invite over. A web address opens in a new tab; an app's own link scheme is
 * followed in place, and if nothing comes up - the page keeps focus, stays in front, and its
 * timers never stall - the player is pointed to the other ways to share.
 */
function openApp(scene: Phaser.Scene, name: string, url: string): void {
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
    if (!opened && scene.sys.isActive()) {
      notify(scene, `${name} didn't open - try another way to share`);
    }
  }, checkAfterMs);
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
