# AGENTS.md — read this before editing Zebra Circus with an AI

This repo is a game **plus** a live collaborative scene editor. An AI agent
that edits it can break things that look fine locally but fail a hidden
contract. Follow these rules; they encode real breakages we have already
had to repair.

## The one mental model: two lanes

- **Code lane** — `index.html`, `models/`, `multiplayer/`, docs. Edit these
  on normal git branches and open a PR to `main`.
- **Scene lane** — `zebra-circus.scene.json`. This file is owned by the live
  editor room. **Never hand-edit it in git.** Change the scene in the hosted
  editor (Save → Queue GitHub); the sync pipeline commits it to the
  `scene-sync` branch for review. A manual edit here will be overwritten and
  can desync the room.

The two lanes are disjoint by design: `scene.json` is never touched by code
PRs, and code files are never touched by the sync pipeline. Keep it that way.

## Hard contracts (a hidden gate enforces these)

`tests/zebraIntegration.mjs` (the "parity gate") fails the build if any of
these break. Run it before merging a code change (see below). Each rule
below is here because breaking it already cost a debugging session:

1. **All 222 fixed scene objects must register at boot** — including the 28
   `crowd-gltf-*` floor spectators and the 4 `barrel-*` / `center-plinth`
   props. To remove something visually, **hide it in the editor** (that
   lives in the scene). Do **not** delete or skip its spawn call in code.
2. **The imported floor crowd uses exactly the six original models**
   (`char1, char2, char4, char6, man, worker`) across 28 instances. Add new
   Meshy crowds as *additional* systems (like the bleacher audience), never
   by replacing those six.
3. **The four QR boards must show four distinct product textures.** The QR
   face mesh keeps `material.name === 'QrFace'` — keep that name so
   validation and artwork-swap can find it under any decorative framing.
4. **Edit and Play must render pixel-identically at the same camera until
   gameplay starts.** Two consequences you must respect:
   - Canvas-drawn textures use **system fonts only** (`Arial, sans-serif`).
     A web font changes pixels between load states and fails the gate.
   - **Ambient motion (spotlights, crowd sway, prop bob) must be gated on
     `gameActive`.** Anything that animates before gameplay begins fails
     the same-camera parity hash.

## Studio-inert rule for gameplay features

Anything that is gameplay, multiplayer, or a game-only visual must be a
no-op inside the Studio editor. Gate it on `STUDIO_AUTHORING_MODE` (and, for
multiplayer, only start on `gameActive`). The multiplayer client
(`?mp=1`) and the prop upgrades are the reference pattern. If your feature
opens a socket, animates, or draws in authoring mode, it breaks parity.

## Multiplayer + analytics

- The relay is `multiplayer/worker.mjs`, deployed as `zebra-circus-mp`.
- Luna analytics posts to the relay's `/analytics` endpoint; read events
  with `wrangler tail zebra-circus-mp`. Do not point it at a placeholder URL.

## Generating 3D art (Meshy)

New characters/props are made with Meshy text/image-to-3D. Keep GLBs
self-contained (no external URIs), keep files under ~10 MB, and place them
in `models/props/` or `models/crowd/`. Rigging fails on roughly a third of
mascots — always keep a static fallback path.

## Running the parity gate before you merge code

From a `game-port-studio` engine checkout, with this game served on `:8765`
and the engine dev server on `:8766`:

```
ZEBRA_GAME_PATH=<path to this repo> node tests/zebraIntegration.mjs
```

Also run the game's own suites when you touch those areas:
`tools/test-weapon-drop.mjs`, `tools/test-pause-shop.mjs`,
`multiplayer/qa_two_browsers.mjs`.

## If a scene change won't reach GitHub

Scene sync = Save, then **Queue GitHub → "Queue GitHub update"** (the button
*inside* the confirm dialog — clicking only the top "Queue GitHub" opens the
dialog but does not send it). The change lands on `scene-sync`. Queueing is a
deliberate human-confirmed step; automate everything else, never that.

See `CONTRIBUTING.md` for the same rules in human-review form.
