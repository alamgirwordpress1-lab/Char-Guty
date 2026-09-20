# Store listing kit

Everything a store asks for in one place. The same text and art fit Google Play, Samsung
Galaxy Store and the Amazon Appstore - only Play charges to open an account ($25, one
time); the other two are free. Answers marked **decide** are the owner's to confirm.

## Identity

| Field                | Value                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| App name             | Char Guty                                                                                                               |
| Package / App ID     | `com.charguty.game`                                                                                                     |
| Category             | Games -> Board                                                                                                          |
| Contains ads         | **No, for now** - the Android app has no ad network yet, so Free Coins is hidden there. Switch to Yes once one is added |
| In-app purchases     | No - none, ever                                                                                                         |
| Website              | https://charguty.online/                                                                                                |
| Privacy policy       | https://http--char-guty-server--gf6pxjtyq6lt.code.run/privacy                                                           |
| Account deletion URL | https://http--char-guty-server--gf6pxjtyq6lt.code.run/delete-account (in the game: Profile -> Delete account)           |
| Support email        | the owner's own address (stores show it publicly)                                                                       |

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

A short tutorial walks you through your first throw and tokka.

PLAY YOUR WAY
- Play Online - matched with other players for a coin pot; computer players fill in
  when nobody else is around
- Play With Friends - make a private room and send the link; whoever opens it joins you
- Play vs Computer - practice any time, nothing at stake

FREE, AND STAYS FREE
There is nothing to buy. You start with 300 coins and win more by winning matches. Coins
are just for playing - they cannot be bought, sold or cashed out, and Win Points only
decide your place on the leaderboard.

Two to four players, one quick round at a time.
```

## Art

| Asset                  | File                           | Size                 |
| ---------------------- | ------------------------------ | -------------------- |
| App icon               | `branding/app-icon.png`        | 1024x1024            |
| Feature graphic (Play) | `branding/feature-graphic.png` | 1024x500             |
| Phone screenshots      | `branding/screenshots/*.jpg`   | 720x1280, at least 2 |
| Link preview (web)     | `public/share-card.png`        | 1200x630             |

Regenerate the art with `pnpm -F @char-guty/game exec tsx scripts/generate-icon.ts`. The
screenshots come from the live game: open it with `?snap` (which exposes the Phaser
instance as `charGutyGame`), then in the console run
`charGutyGame.renderer.snapshot(i => (window.s = i.src), 'image/jpeg', 0.85)` and save
`window.s`. A WebGL canvas reads back blank through `toDataURL`, so only the renderer's
own snapshot works.

## Content rating questionnaire (IARC)

The same questionnaire serves Play, Galaxy Store and Facebook.

| Question                     | Answer                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Violence, blood, horror      | None                                                                                                                                                                      |
| Sexual content, nudity       | None                                                                                                                                                                      |
| Profanity, crude humour      | None                                                                                                                                                                      |
| Alcohol, tobacco, drugs      | None                                                                                                                                                                      |
| Real-money gambling          | **No** - nothing can be bought, won or cashed out for money                                                                                                               |
| Simulated gambling           | **decide** - players stake in-game coins on a match. The coins cannot be purchased and have no cash value, but the stake is a wager, so answering yes is the safe reading |
| User interaction             | Yes - players are matched with strangers online                                                                                                                           |
| Shares user location         | No                                                                                                                                                                        |
| Unrestricted internet access | No                                                                                                                                                                        |
| Digital purchases            | No                                                                                                                                                                        |

## Data safety form (Play)

| Question                                    | Answer                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Does the app collect or share user data?    | Collects, does not share                                                                                                      |
| Personal info                               | Only the nickname the player types (no real name, email, phone)                                                               |
| App activity                                | In-game actions: matches played, results, coins, win points                                                                   |
| Device or other IDs                         | A player id the game creates; no advertising id used by the game itself                                                       |
| Location, contacts, photos, files, messages | None                                                                                                                          |
| Is data encrypted in transit?               | Yes - HTTPS and WSS                                                                                                           |
| Can users request deletion?                 | Yes - in the game (Profile -> Delete account), or through the account deletion URL above                                      |
| Is data collection optional?                | No - an account is needed to play online                                                                                      |
| Data handled by the ad network              | None in the Android app yet (it has no ad network). On Facebook, Meta Audience Network handles ad data under Meta's own terms |

## Release checklist

1. Make the upload keystore once, on the owner's own machine (no JDK needed):
   `pnpm -F @char-guty/game exec tsx scripts/make-upload-keystore.ts`. It asks for a
   password twice - typed blind, never stored here - and writes `upload.p12` plus the same
   file as base64 to `Desktop\char-guty-keystore`. Never commit either file: losing the
   keystore or its password means the app can never be updated under com.charguty.game.
   Then add three repository secrets (GitHub -> Settings -> Secrets and variables ->
   Actions): `ANDROID_KEYSTORE_BASE64` (the whole base64 file), `ANDROID_KEYSTORE_PASSWORD`
   and `ANDROID_KEY_ALIAS` = `charguty`. The "Android release" workflow then builds the
   signed `.aab` for Play and `.apk` for the other stores, and refuses a debug-signed build.
2. `targetSdkVersion` is already 36, which is what Play requires from 31 Aug 2026.
3. Play only: a personal developer account opened after 13 Nov 2023 must run a closed
   test with 12 testers opted in continuously for 14 days before production opens.
   Galaxy Store and Amazon have no such rule.
4. Play Console: fill in the Data safety form and the content rating questionnaire with
   the answers above, set the target audience to 13 and over (online play with strangers,
   coin stakes), and give the account deletion URL.

## Facebook Instant Games

What the build already does for review: players go straight in as a guest (no sign-in
screen of the game's own), invites go through Facebook's friend picker only, there are
no links out except the privacy policy, and Free Coins stays hidden until Audience Network
placement IDs are set in `.env.fbinstant`. Build the upload with
`pnpm -F @char-guty/game run bundle:fb`.

Still the owner's to do, in order: business verification (in review), the Approved
Partner Program application, then the Instant Games review with the icon, cover image,
gameplay video and screenshots, the IARC contact email, and the privacy policy and
account deletion URLs above.
