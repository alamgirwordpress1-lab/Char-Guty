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

## What the build does for CrazyGames

- Starts CrazyGames' SDK (v3) and reports loading, and gameplay start/stop around every game.
- Accounts: a player logged in to CrazyGames is signed in with that account automatically,
  under their CrazyGames username (the server checks the SDK's token against CrazyGames'
  public key). The first time, the guest they were playing as on that device becomes the
  account, coins and history included. Everyone else plays as a guest. There is no other
  sign-in and no sign-out button: accounts are CrazyGames' business.
- One tap to play: PLAY ONLINE and PLAY VS COMPUTER start at the first table straight away;
  the table list only shows when the player can't afford that table.
- Rooms: the room a player is in is reported to CrazyGames, joinable while a private room
  has seats free. Invites carry the room code, accepting one mid-session moves the player
  to that room, and a launch from CrazyGames' own multiplayer button opens a new private
  room.
- After a game the same table plays the next one, so a group stays together.
- A midgame video between games, and a rewarded video for +25 coins that pays only when the
  video finishes. The game goes quiet while a video plays and follows CrazyGames' mute
  setting.
- No other ads and no links out.

## Still to do

- The developer account is the owner's to create; then upload the zip and the covers and
  fill in the form above.
- At Full Launch, set `CRAZYGAMES_AD_REWARDS=true` on char-guty-server, or rewarded videos
  play but credit no coins.
