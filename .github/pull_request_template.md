<!-- Read AGENTS.md and CONTRIBUTING.md before opening this PR. -->

## What changed

<!-- Describe the change. -->

## Contract checklist (the Zebra parity gate enforces these)

Branch this off the latest `main` so you have `AGENTS.md`, `CONTRIBUTING.md`,
and the current fixes. If the gate fails, **fix this branch to comply** — do
not force-push `main`, rewrite history, or remove the gate.

- [ ] Branched from the latest `main` (not an older branch).
- [ ] All 222 fixed scene objects still register (hide things in the editor,
      never skip a spawn in code).
- [ ] Imported floor crowd still uses the six original models across 28
      instances; new crowds are additive.
- [ ] The four QR boards still show four distinct textures (`QrFace` mesh
      name preserved).
- [ ] Canvas textures use system fonts only, and ambient motion
      (spotlights, crowd sway, prop bob) is gated on `gameActive`.
- [ ] Gameplay/multiplayer features stay inert in the Studio
      (`STUDIO_AUTHORING_MODE`).
- [ ] Scene changes went through the editor (Save → Queue GitHub), not by
      hand-editing `zebra-circus.scene.json`.
- [ ] New serverless/backend code (`api/`, DB) documents its env/secrets and
      how it deploys.
