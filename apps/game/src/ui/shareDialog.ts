import type Phaser from "phaser";
import { ensureShareIcons } from "./shareIcons.js";
import { COLOR, TEXT } from "./theme.js";
import { dialog, glossyButton, notify } from "./widgets.js";
import type { ButtonColor } from "./widgets.js";

interface ShareTarget {
  readonly label: string;
  readonly icon: string;
  readonly color: ButtonColor;
  readonly share: () => void;
}

const DIALOG_WIDTH = 640;
const BUTTON_WIDTH = 270;
const BUTTON_HEIGHT = 92;
const ROW_STEP = 112;

/**
 * The room invite, sent straight to a chat app or a social network, or copied. On a phone
 * the apps open through their own link schemes, which leave this page and its room where
 * they are - an in-app browser would swap the page out for a web address. A computer gets
 * each network's web share page in a new tab.
 */
export function openShareDialog(scene: Phaser.Scene, code: string, link: string): void {
  ensureShareIcons(scene);
  const text = `Join my Char Guty room! Code: ${code}`;
  const message = encodeURIComponent(`${text} ${link}`);
  const url = encodeURIComponent(link);
  const words = encodeURIComponent(text);
  const onPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const targets: ShareTarget[] = [
    {
      label: "WHATSAPP",
      icon: "share-whatsapp",
      color: "green",
      share: () =>
        openApp(
          scene,
          "WhatsApp",
          onPhone ? `whatsapp://send?text=${message}` : `https://wa.me/?text=${message}`,
        ),
    },
    {
      label: "FACEBOOK",
      icon: "share-facebook",
      color: "blue",
      share: () =>
        openApp(scene, "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${url}`),
    },
  ];
  // Messenger's share screen only exists in its phone app.
  if (onPhone) {
    targets.push({
      label: "MESSENGER",
      icon: "share-messenger",
      color: "blue",
      share: () => openApp(scene, "Messenger", `fb-messenger://share/?link=${url}`),
    });
  }
  targets.push(
    {
      label: "TELEGRAM",
      icon: "share-telegram",
      color: "blue",
      share: () =>
        openApp(
          scene,
          "Telegram",
          onPhone
            ? `tg://msg_url?url=${url}&text=${words}`
            : `https://t.me/share/url?url=${url}&text=${words}`,
        ),
    },
    {
      label: "X (TWITTER)",
      icon: "share-x",
      color: "gray",
      share: () => openApp(scene, "X", `https://twitter.com/intent/tweet?text=${words}&url=${url}`),
    },
    {
      label: "COPY LINK",
      icon: "share-link",
      color: "orange",
      share: () => void copyInvite(scene, code, link),
    },
  );
  // Where there is a system share sheet it reaches everything else - SMS, email, Instagram.
  if (targets.length % 2 === 1 && typeof navigator.share === "function") {
    targets.push({
      label: "MORE",
      icon: "icon-share",
      color: "gray",
      share: () => void shareSheet(text, link),
    });
  }

  const rows = Math.ceil(targets.length / 2);
  const height = 250 + rows * ROW_STEP;
  const top = -height / 2;
  const box = dialog(scene, "Invite Friends", DIALOG_WIDTH, height);
  box.add(
    scene.add.text(0, top + 128, "Send your friends the room link", TEXT.body).setOrigin(0.5),
  );
  targets.forEach((target, i) => {
    const column = i % 2;
    const alone = column === 0 && i === targets.length - 1;
    const x = alone ? 0 : column === 0 ? -145 : 145;
    const y = top + 220 + Math.floor(i / 2) * ROW_STEP;
    const button = glossyButton(scene, x, y, target.label, target.share, {
      width: BUTTON_WIDTH,
      height: BUTTON_HEIGHT,
      color: target.color,
      icon: target.icon,
      fontSize: 24,
    });
    box.add(button.container);
  });
  box.add(
    scene.add
      .text(0, height / 2 - 54, `Room code: ${code}`, { ...TEXT.heading, color: COLOR.goldText })
      .setOrigin(0.5),
  );
}

/** Copies the invite link, and says whether that worked - falling back to the room code. */
export async function copyInvite(scene: Phaser.Scene, code: string, link: string): Promise<void> {
  const copied = await copyText(link);
  if (!scene.sys.isActive()) return;
  notify(
    scene,
    copied
      ? "Invite link copied - paste it in your chat"
      : `Couldn't copy the link - send your friend the room code: ${code}`,
  );
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

async function shareSheet(text: string, link: string): Promise<void> {
  try {
    await navigator.share({ title: "Char Guty", text, url: link });
  } catch {
    // Closed by the player, or refused: the dialog is still there.
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
