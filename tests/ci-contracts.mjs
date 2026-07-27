// Self-contained parity/contract gate for CI. Needs only Playwright and a
// static server on :8765 (no private engine). Boots the game in authoring
// mode, asserts the studio contracts via the game's own validation snapshot,
// then boots normal play and asserts a clean start. Exits non-zero on any
// violation. Rules explained in AGENTS.md / CONTRIBUTING.md.
import { chromium } from "playwright";

const BASE = process.env.CI_GAME_URL || "http://127.0.0.1:8765";
const SIX_ORIGINAL_CROWD = ["char1", "char2", "char4", "char6", "man", "worker"];
const fails = [];
const ok = [];
const check = (name, pass, detail = "") => (pass ? ok : fails).push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });

// ---- Contract checks (authoring mode) ----
const authoring = await browser.newPage({ viewport: { width: 900, height: 600 } });
const authErrors = [];
authoring.on("pageerror", (e) => authErrors.push(String(e).slice(0, 160)));
await authoring.goto(`${BASE}/?studioMode=authoring&editorOrigin=${encodeURIComponent(BASE)}`, { waitUntil: "domcontentloaded" });
let snap = null;
try {
  await authoring.waitForFunction(() => window.__zebraStudioValidation?.snapshot()?.objectCount >= 1, null, { timeout: 60000 });
  // let async crowd/props finish registering
  for (let i = 0; i < 30; i++) {
    snap = await authoring.evaluate(() => window.__zebraStudioValidation.snapshot());
    if (snap.objectCount >= 222) break;
    await authoring.waitForTimeout(1000);
  }
} catch (e) {
  check("authoring scene boots", false, String(e).slice(0, 120));
}
if (snap) {
  check("contract 1: all 222 fixed objects register", snap.objectCount === 222, `got ${snap.objectCount}`);
  const qr = snap.qrTextureHashes || [];
  const distinctQr = new Set(qr.map((e) => e.hash));
  check("contract 3: four distinct QR board textures", qr.length === 4 && distinctQr.size === 4, `boards=${qr.length} distinct=${distinctQr.size}`);
  const sources = (snap.crowd?.importedSources || []).map((s) => String(s).replace(/^crowd:/, ""));
  const distinctSources = [...new Set(sources)].sort();
  const isSubset = distinctSources.every((s) => SIX_ORIGINAL_CROWD.includes(s));
  check("contract 2: imported crowd uses the six original models across 28 instances", sources.length === 28 && isSubset && distinctSources.length <= 6, `instances=${sources.length} sources=[${distinctSources.join(",")}]`);
  check("no console/page errors during authoring boot", authErrors.length === 0, authErrors.join(" | "));
}
await authoring.close();

// ---- Boot smoke (normal play) ----
const play = await browser.newPage({ viewport: { width: 900, height: 600 } });
const playErrors = [];
play.on("pageerror", (e) => playErrors.push(String(e).slice(0, 160)));
try {
  await play.goto(`${BASE}/?mp=0`, { waitUntil: "domcontentloaded" });
  await play.waitForSelector("#play-btn", { state: "visible", timeout: 30000 });
  await play.click("#play-btn");
  await play.waitForSelector("#tut-go-btn", { state: "visible", timeout: 15000 });
  await play.click("#tut-go-btn");
  await play.waitForTimeout(1500);
  const state = await play.evaluate(() => JSON.parse(window.render_game_to_text()));
  check("boot smoke: game reaches PLAYING", state.mode === "playing" || state.player != null, JSON.stringify(state.mode));
  check("boot smoke: no runtime errors on start", playErrors.length === 0, playErrors.join(" | "));
} catch (e) {
  check("boot smoke: normal play boots", false, String(e).slice(0, 140));
}
await play.close();
await browser.close();

console.log([...ok, ...fails].join("\n"));
if (fails.length) {
  console.error(`\n================ PARITY GATE FAILED (${fails.length}) ================`);
  console.error("This branch violates a Zebra studio contract. Read AGENTS.md and");
  console.error("CONTRIBUTING.md in this repo, then FIX YOUR BRANCH to comply.");
  console.error("Do NOT force-push main, rewrite history, or delete the gate to get");
  console.error("around this - that breaks the shared editor + sync pipeline for");
  console.error("everyone. The four contracts and how to satisfy them are in AGENTS.md.");
  console.error("=================================================================");
  process.exit(1);
}
console.log("\nAll Zebra contracts satisfied.");
