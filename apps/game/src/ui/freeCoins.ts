import type Phaser from "phaser";
import { ads } from "../services/ads.js";
import { getSession } from "../state/session.js";
import { TEXT } from "./theme.js";
import { dialog, glossyButton, notify } from "./widgets.js";

/** Offers a rewarded video for +25 coins; the server caps how many count per day. */
export function openFreeCoins(scene: Phaser.Scene, onCoins: (coins: number) => void): void {
  const box = dialog(scene, "Free Coins", 580, 540);
  const coin = scene.add.image(0, -70, "icon-coin").setDisplaySize(150, 150);
  const pitch = scene.add
    .text(0, 60, "Watch a short video\nand get 25 coins", { ...TEXT.body, align: "center" })
    .setOrigin(0.5);
  const watch = glossyButton(
    scene,
    0,
    180,
    "WATCH VIDEO",
    () => {
      watch.setEnabled(false);
      void ads.showRewarded().then((result) => {
        if (result === "rewarded") {
          onCoins(getSession().coins);
          box.close();
          notify(scene, "+25 coins added!");
        } else {
          watch.setEnabled(true);
          notify(scene, "No video right now. Free coins can be claimed 12 times a day.");
        }
      });
    },
    { width: 400, height: 96, color: "green" },
  );
  box.add(coin, pitch, watch.container);
}
