# Audio

## bigtop_theme.mp3

The looping background bed for the arena. Plays from `dismissTutorial()` once the player
has interacted, routed through the game's existing Web Audio graph
(`musicGain` -> `master`), so the mute toggle and the M key already control it.

It is deliberately **not** an `<audio>` element. A media element hands playback to the
OS media session, which several web-game platforms reject.

- Duration 1:33, instrumental, loops seamlessly enough to run continuously.
- Generated 28 July 2026 with Suno v5.5, Instrumental mode on.
- Source: https://suno.com/song/59518c9c-d97d-45b0-b219-d62ecc2eb5a7
- sha256 of this file is recorded in the review pack manifest alongside seven other
  candidates that were not used.

### Licence

Generated on an account showing an active Suno Pro subscription. Suno states paid-tier
output may be used commercially, subject to its Terms; it does not guarantee copyright
protection, uniqueness or non-infringement. Confirm that position before treating this
as a fully cleared production asset.

### Replacing it

Drop a new file at `audio/bigtop_theme.mp3` and nothing else needs to change. If the file
is missing or fails to decode, the game falls back to the short procedural melody that
used to be the only music, so a bad path degrades to the old behaviour rather than
silence.

The service worker runtime-caches this file on first play; it is intentionally not in the
`CORE` precache list, so installing the PWA does not pull 2 MB of audio up front.
