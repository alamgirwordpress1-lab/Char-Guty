# Store listing kit

Everything a store asks for in one place. The same text and art fit Google Play, Samsung
Galaxy Store and the Amazon Appstore - only Play charges to open an account ($25, one
time); the other two are free. Answers marked **decide** are the owner's to confirm.

## Identity

| Field | Value |
| --- | --- |
| App name | Char Guty |
| Package / App ID | `com.charguty.game` |
| Category | Games -> Board |
| Contains ads | Yes (rewarded video for free coins) |
| In-app purchases | No - none, ever |
| Website | https://alamgirwordpress1-lab.github.io/Char-Guty/ |
| Privacy policy | https://http--char-guty-server--gf6pxjtyq6lt.code.run/privacy |
| Support email | the owner's own address (stores show it publicly) |

## Short description (max 80 characters)

```
The classic four-piece village game. Throw, tokka and win - free with friends.
```

## Full description (max 4000 characters)

```
Char Guty brings the village game of four gutis online.

Throw all four pieces at once and see how they land. Every flat face is a point - and
if all four land flat, you take four points and throw again. Land none of them flat and
you win the match outright.

Then comes the hard part: the tokka. Grab a guti, pull back and flick it into another
one. Land it and both pieces leave the mat, so the next tokka has to cross a wider gap.
Miss, and your turn is over. Flick too hard and the guti strays - just like the real
thing.

HOW TO PLAY
- Throw four gutis; flat faces score
- Take up to two tokkas each turn, one point each
- Keep your turn as long as you keep landing them
- First to the pot wins it all

PLAY YOUR WAY
- Play Online - matched with other players for a coin pot
- Play With Friends - make a private room and send the link; whoever opens it joins you
- Play vs Computer - practice any time, nothing at stake

FREE, AND STAYS FREE
There is nothing to buy. You start with 300 coins, win more by winning matches, and top
up by watching a video if you run low. Coins are just for playing - they cannot be
bought, sold or cashed out, and Win Points only decide your place on the leaderboard.

Two to four players, one quick round at a time.
```

## Art

| Asset | File | Size |
| --- | --- | --- |
| App icon | `branding/app-icon.png` | 1024x1024 |
| Feature graphic (Play) | `branding/feature-graphic.png` | 1024x500 |
| Phone screenshots | `branding/screenshots/*.jpg` | 720x1280, at least 2 |
| Link preview (web) | `public/share-card.png` | 1200x630 |

Regenerate the art with `pnpm -F @char-guty/game exec tsx scripts/generate-icon.ts`. The
screenshots come from the live game: open it with `?snap` (which exposes the Phaser
instance as `charGutyGame`), then in the console run
`charGutyGame.renderer.snapshot(i => (window.s = i.src), 'image/jpeg', 0.85)` and save
`window.s`. A WebGL canvas reads back blank through `toDataURL`, so only the renderer's
own snapshot works.

## Content rating questionnaire (IARC)

The same questionnaire serves Play, Galaxy Store and Facebook.

| Question | Answer |
| --- | --- |
| Violence, blood, horror | None |
| Sexual content, nudity | None |
| Profanity, crude humour | None |
| Alcohol, tobacco, drugs | None |
| Real-money gambling | **No** - nothing can be bought, won or cashed out for money |
| Simulated gambling | **decide** - players stake in-game coins on a match. The coins cannot be purchased and have no cash value, but the stake is a wager, so answering yes is the safe reading |
| User interaction | Yes - players are matched with strangers online |
| Shares user location | No |
| Unrestricted internet access | No |
| Digital purchases | No |

## Data safety form (Play)

| Question | Answer |
| --- | --- |
| Does the app collect or share user data? | Collects, does not share |
| Personal info | Only the nickname the player types (no real name, email, phone) |
| App activity | In-game actions: matches played, results, coins, win points |
| Device or other IDs | A player id the game creates; no advertising id used by the game itself |
| Location, contacts, photos, files, messages | None |
| Is data encrypted in transit? | Yes - HTTPS and WSS |
| Can users request deletion? | Yes - the privacy policy says how |
| Is data collection optional? | No - an account is needed to play online |
| Data handled by the ad network | Meta Audience Network handles ad data under Meta's own terms |

## Release checklist

1. Build a signed AAB (Play) or APK (Galaxy Store, Amazon). Needs an upload keystore -
   not created yet, and the password is the owner's to set.
2. `targetSdkVersion` is already 36, which is what Play requires from 31 Aug 2026.
3. Play only: a personal developer account opened after 13 Nov 2023 must run a closed
   test with 12 testers opted in continuously for 14 days before production opens.
   Galaxy Store and Amazon have no such rule.
