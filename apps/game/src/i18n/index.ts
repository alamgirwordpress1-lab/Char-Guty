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
  readonly throw: string;
  readonly you: string;
  readonly yourTurn: string;
  readonly turnOf: string;
  readonly tokkaHint: string;
  readonly aimHint: string;
  readonly aimCancelled: string;
  readonly die: string;
  readonly instantWin: string;
  readonly winToast: string;
  readonly reconnecting: string;
  readonly reconnectFailed: string;
  readonly playAgain: string;
  readonly watchAd: string;
  readonly watchingAd: string;
  readonly adRewarded: string;
  readonly adFailed: string;
  readonly leaderboardTitle: string;
  readonly periodWeek: string;
  readonly periodAll: string;
  readonly rank: string;
  readonly winPointsLabel: string;
  readonly noEntries: string;
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
  throw: "ছুঁড়ুন",
  you: "আপনি",
  yourTurn: "আপনার পালা",
  turnOf: " এর পালা",
  tokkaHint: "হলুদ গুটি টেনে টোক্কা দিন",
  aimHint: "লক্ষ্যের দিকে টানুন, ছাড়লেই টোক্কা",
  aimCancelled: "হাইলাইট করা গুটির দিকে টানুন",
  die: "ডাই!",
  instantWin: "সব উল্টো — তাৎক্ষণিক জয়!",
  winToast: "জয়!",
  reconnecting: "সংযোগ বিচ্ছিন্ন — পুনরায় সংযোগ হচ্ছে...",
  reconnectFailed: "পুনরায় সংযোগ করা যায়নি",
  playAgain: "আবার খেলুন",
  watchAd: "বিজ্ঞাপন দেখুন, +২৫ কয়েন",
  watchingAd: "বিজ্ঞাপন দেখানো হচ্ছে...",
  adRewarded: "+২৫ কয়েন যোগ হয়েছে!",
  adFailed: "বিজ্ঞাপন থেকে পুরস্কার পাওয়া যায়নি",
  leaderboardTitle: "লিডারবোর্ড",
  periodWeek: "এই সপ্তাহ",
  periodAll: "সর্বমোট",
  rank: "স্থান",
  winPointsLabel: "জয় পয়েন্ট",
  noEntries: "এখনো কোনো তথ্য নেই",
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
  throw: "Throw",
  you: "you",
  yourTurn: "Your turn",
  turnOf: "'s turn",
  tokkaHint: "Drag a highlighted guti to tokka",
  aimHint: "Drag toward the target, release to flick",
  aimCancelled: "Aim at a highlighted guti",
  die: "DIE!",
  instantWin: "All round — instant win!",
  winToast: "WIN!",
  reconnecting: "Disconnected — reconnecting...",
  reconnectFailed: "Could not reconnect",
  playAgain: "Play again",
  watchAd: "Watch ad, +25 coins",
  watchingAd: "Showing ad...",
  adRewarded: "+25 coins added!",
  adFailed: "Could not get ad reward",
  leaderboardTitle: "Leaderboard",
  periodWeek: "This week",
  periodAll: "All time",
  rank: "Rank",
  winPointsLabel: "Win points",
  noEntries: "No entries yet",
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
