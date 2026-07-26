# Contributing to Zebra Circus

Two lanes, one rule set. Code lives in git; the scene lives in the hosted
editor room. They never conflict as long as each stays in its lane.

## The two lanes

- **Game code and assets** (index.html, models/, multiplayer/): normal git
  branches and merges. Never edit `zebra-circus.scene.json` directly - the
  editor room owns it, and the sync pipeline will overwrite manual edits.
- **The scene** (object transforms, visibility, materials, uploaded GLBs,
  visual replacements): edit in the hosted editor. Save creates an online
  checkpoint; Queue GitHub lands it on the `scene-sync` branch as a
  one-file commit for review.

## Contracts the parity gate enforces

Run the gate before merging any game-code branch (from a game-port-studio
checkout: `ZEBRA_GAME_PATH=<this repo> node tests/zebraIntegration.mjs`
with the game on :8765 and the engine dev server on :8766).

1. **All 222 fixed objects must register at boot** - including the 28
   `crowd-gltf-*` floor spectators. To remove something visually, hide it
   in the editor (that lives in the authored scene); never skip its spawn
   in code.
2. **The imported floor crowd uses the six original models**
   (`char1, char2, char4, char6, man, worker`) across 28 instances. New
   Meshy audiences are welcome as additive systems (e.g. the bleachers).
3. **The four QR boards must carry four distinct product QR textures.**
   The board face mesh keeps `material.name === 'QrFace'` so validation
   and artwork replacement can find it under any decorative framing.
4. **Edit and Play must render pixel-identically at the same camera until
   gameplay begins.** Canvas-drawn textures use system fonts only (webfont
   load races change pixels), and ambient animation (spotlights, crowd
   sway, prop motion) starts only when `gameActive` is true.

## Multiplayer and analytics

The relay (`multiplayer/worker.mjs`) is deployed as `zebra-circus-mp`.
Luna analytics posts to its `/analytics` endpoint; read events with
`wrangler tail zebra-circus-mp`. Gameplay features must stay inert in the
Studio (`STUDIO_AUTHORING_MODE` guard) - the multiplayer client and prop
upgrades show the pattern.
