import type { CapacitorConfig } from "@capacitor/cli";

/** The Android app ships the `android` web build and plays on the live server over wss. */
const config: CapacitorConfig = {
  appId: "com.charguty.game",
  appName: "Char Guty",
  webDir: "build/android",
  android: { backgroundColor: "#0a173f" },
};

export default config;
