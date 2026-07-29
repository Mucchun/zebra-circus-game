# Audio

## bigtop_theme.mp3

The looping background bed for the arena. Started from `dismissTutorial()` once the
player has interacted, stopped by `exitToMenu()`.

It replaced `zebra-tech.mp3`. If that was a deliberate client-branding choice rather than
a placeholder, say so and it goes straight back - swapping is a one-line change to
`MUSIC_URL` plus the file.

- 1:33, stereo, instrumental.
- Generated 28 July 2026 with Suno v5.5, Instrumental mode on.
- Source: https://suno.com/song/59518c9c-d97d-45b0-b219-d62ecc2eb5a7
- Seven other candidates exist and were not used, including a boss-fight cue and a menu
  waltz. Ask if you want to hear them.

## Why it is not an `<audio>` element

The previous implementation used `new Audio('audio/zebra-tech.mp3')`. Two problems:

1. A media element hands playback to the OS media session - lock-screen transport
   controls, hardware media keys - and several web-game platforms reject a build for it.
2. The `ended` listener added as a loop safety net was dead code. `ended` does not fire
   when `loop` is `true`, so it never ran. Media-element looping also leaves an audible
   gap at the seam, which is the likely reason looping needed a follow-up fix.

The bed is now decoded once and played through a `BufferSource` with `loop = true` on the
same Web Audio graph as the SFX (`musicGain` -> `master`). That loops sample-accurately,
and the mute toggle and M key now control music and SFX through the single master gain
instead of keeping a separate media-element mute in sync.

`musicGain` is 0.38, which through the 0.9 master lands at ~0.35 effective - the same
level the media element was set to, so the music/SFX balance is unchanged.

The audio context is now suspended on tab-hide, which did not happen before.

## Service worker

This file is intentionally not in the `CORE` precache list in `sw.js`. It runtime-caches
on first play, so installing the PWA does not pull 2 MB of audio up front. The cache
version does not need bumping for the swap, because `index.html` is served network-first.

## Licence

Generated on an account showing an active Suno Pro subscription. Suno states paid-tier
output may be used commercially, subject to its Terms; it does not guarantee copyright
protection, uniqueness or non-infringement. Confirm that position before treating this as
a fully cleared production asset.
