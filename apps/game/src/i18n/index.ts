export type Locale = "bn" | "en";

export interface Labels {
  readonly loginTitle: string;
  readonly loginGoogle: string;
  readonly loginFacebook: string;
  readonly loginGuest: string;
  readonly signingIn: string;
  readonly lobbyTitle: string;
  readonly coins: string;
  readonly potLabel: string;
  readonly playersLabel: string;
  readonly playWithFriends: string;
  readonly createRoom: string;
  readonly joinByCode: string;
  readonly enterCode: string;
  readonly join: string;
  readonly randomMatch: string;
  readonly roomCode: string;
  readonly waiting: string;
  readonly cancel: string;
  readonly back: string;
  readonly resultWin: string;
  readonly resultLose: string;
  readonly backToLobby: string;
  readonly loading: string;
  readonly gameComingSoon: string;
  readonly leave: string;
}

const bn: Labels = {
  loginTitle: "চার গুটি",
  loginGoogle: "গুগল দিয়ে লগইন",
  loginFacebook: "ফেসবুক দিয়ে লগইন",
  loginGuest: "গেস্ট হিসেবে খেলুন",
  signingIn: "লগইন হচ্ছে...",
  lobbyTitle: "লবি",
  coins: "কয়েন",
  potLabel: "পট",
  playersLabel: "খেলোয়াড় সংখ্যা",
  playWithFriends: "বন্ধুদের সাথে খেলুন",
  createRoom: "রুম তৈরি করুন",
  joinByCode: "কোড দিয়ে যোগ দিন",
  enterCode: "৬ অক্ষরের কোড",
  join: "যোগ দিন",
  randomMatch: "র‍্যান্ডম ম্যাচ",
  roomCode: "রুম কোড",
  waiting: "অপেক্ষা করা হচ্ছে...",
  cancel: "বাতিল",
  back: "ফিরে যান",
  resultWin: "আপনি জিতেছেন!",
  resultLose: "আপনি হেরেছেন",
  backToLobby: "লবিতে ফিরে যান",
  loading: "লোড হচ্ছে...",
  gameComingSoon: "খেলা শীঘ্রই আসছে",
  leave: "চলে যান",
};

const en: Labels = {
  loginTitle: "Char Guty",
  loginGoogle: "Sign in with Google",
  loginFacebook: "Sign in with Facebook",
  loginGuest: "Play as Guest",
  signingIn: "Signing in...",
  lobbyTitle: "Lobby",
  coins: "Coins",
  potLabel: "Pot",
  playersLabel: "Players",
  playWithFriends: "Play with Friends",
  createRoom: "Create Room",
  joinByCode: "Join by Code",
  enterCode: "6-character code",
  join: "Join",
  randomMatch: "Random Match",
  roomCode: "Room Code",
  waiting: "Waiting...",
  cancel: "Cancel",
  back: "Back",
  resultWin: "You Win!",
  resultLose: "You Lose",
  backToLobby: "Back to Lobby",
  loading: "Loading...",
  gameComingSoon: "Game coming soon",
  leave: "Leave",
};

const locales: Record<Locale, Labels> = { bn, en };

let currentLocale: Locale = "bn";

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: keyof Labels): string {
  return locales[currentLocale][key];
}
