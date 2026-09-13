# CrazyGames kit

Everything the CrazyGames developer portal (developer.crazygames.com) asks for. Build the
upload with `pnpm -F @char-guty/game run bundle:crazygames`: it writes
`build/char-guty-crazygames.zip`, with index.html at its root.

## How a launch goes

1. **Basic Launch** - live for a small audience with CrazyGames' ads switched off. It ends
   once the game has been up 7 days and had 500 plays (21 days at most). Three numbers
   decide what comes next: average play time (aim for 10+ minutes), day-1 retention
   (10-15%) and conversion (80%+ of players still there after a minute).
2. **Full Launch** - offered to games with good numbers. From here the ads earn: CrazyGames
   pays monthly by bank wire (or PayPal) once the balance passes EUR 100. The game may stay
   on other sites as well.

## Submission form

| Field | Value |
| --- | --- |
| Title | Char Guty |
| Technology | HTML5 (Phaser) |
| Orientation | Portrait (letterboxed on desktop) |
| Mobile | Yes - touch |
| Multiplayer | Online, lobby sizes 2, 3 and 4 |
| Chat | None |
| In-game purchases | None |
| Covers | `branding/crazygames/cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` |

### Description

```
Char Guty is the village game of four gutis, online. Throw all four and see how they land:
every flat face scores, all four flat scores four and throws again, and none flat wins the
match on the spot.

Then the hard part - the tokka. Pull a guti back and flick it into another one, carrom
style. Hit, and both leave the mat; miss, and the turn passes. Flick too hard and it strays.

Play online against other players for a pot of coins, make a private room and send the link
to friends, or practise against the computer. First to the pot wins it all.
```

### Controls

```
Tap THROW to throw the four gutis.
Tokka: press a guti, pull back and let go - the longer the pull, the harder the flick.
A mouse works the same way.
```

## What the build already does

- Starts CrazyGames' SDK (v3) and reports loading, and gameplay start/stop around every game.
- A first visit lands on the home screen as a guest: no sign-in screen, no outside logins.
- A midgame video between games, and a rewarded video for +25 coins that pays only when the
  video finishes. The game goes quiet while a video plays and follows CrazyGames' mute
  setting.
- After a game the same table plays the next one, so a group stays together.
- SHARE in a private room makes a CrazyGames invite link that opens that room.
- No other ads and no links out.

## Still to do for Full Launch

- Server: set `CRAZYGAMES_AD_REWARDS=true` on char-guty-server, or rewarded videos play but
  credit no coins.
- Accounts: sign logged-in CrazyGames players in automatically (check `getUserToken()` on the
  server against CrazyGames' public key), link a guest's progress when they log in, and show
  their CrazyGames username.
- Multiplayer: report the room with `updateRoom` / `leftRoom`, and start straight in a room
  when `isInstantMultiplayer` is set.
- At most one click from loading to playing.
