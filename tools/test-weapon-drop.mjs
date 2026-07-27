// Real-input test of scanner pickup / auto-equip / Q-drop / re-pickup.
// Requires the game served on :8765. Run: node tools/test-weapon-drop.mjs
import { importGamePortStudioModule } from "./game-port-studio-path.mjs";

const { chromium } = await importGamePortStudioModule("playwright/index.mjs");
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
await page.addInitScript(() => localStorage.setItem("zebraPlayerRegistered", "1")); // skip lead-capture sign-in
await page.goto("http://127.0.0.1:8765/?mp=0", { waitUntil: "domcontentloaded" });
await page.click("#play-btn");
await page.waitForSelector("#tut-go-btn", { state: "visible" });
await page.click("#tut-go-btn");
await page.mouse.click(450, 300);
await page.waitForTimeout(400);

const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const pickups = () => page.evaluate(() => window.__mpDebug().pickups);

async function rotateTo(desiredYaw) {
  for (let i = 0; i < 4; i += 1) {
    const s = await state();
    let diff = desiredYaw - s.player.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 0.06) return;
    const drag = Math.max(-820, Math.min(820, -diff / 0.0018));
    const startX = drag > 0 ? 40 : 860;
    await page.mouse.move(startX, 300);
    await page.mouse.down();
    await page.mouse.move(startX + drag, 300, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(120);
  }
}

async function walkTo(x, z, closeEnough = 1.6) {
  let previous = null;
  for (let step = 0; step < 24; step += 1) {
    const me = (await state()).player;
    const distance = Math.hypot(x - me.x, z - me.z);
    if (distance < closeEnough) return true;
    if (previous && Math.hypot(me.x - previous.x, me.z - previous.z) < 0.2) {
      await page.keyboard.down("d");
      await page.waitForTimeout(400);
      await page.keyboard.up("d");
    }
    previous = { x: me.x, z: me.z };
    await rotateTo(Math.atan2(-(x - me.x), -(z - me.z)));
    await page.keyboard.down("w");
    await page.waitForTimeout(Math.min(700, Math.max(200, distance * 130)));
    await page.keyboard.up("w");
  }
  return false;
}

// 1. Walk to the nearest pickup and grab it: must auto-equip immediately.
const first = (await pickups()).filter((p) => !p.collected)[0];
check("reached a scanner", await walkTo(first.x, first.z));
await page.keyboard.press("e");
await page.waitForTimeout(350);
let s = await state();
check("pickup auto-equips the scanner", s.weapon !== null, JSON.stringify(s.weapon));
const heldWeapon = s.weapon;

// 2. Drop with Q: hands empty, device re-appears uncollected near the player.
const beforeDrop = (await state()).player;
await page.keyboard.press("q");
await page.waitForTimeout(900); // settle animation
s = await state();
check("Q empties the hands", s.weapon === null, JSON.stringify(s.weapon));
const droppedEntry = (await pickups()).find((p) => !p.collected && Math.hypot(p.x - beforeDrop.x, p.z - beforeDrop.z) < 2.5);
check("dropped scanner rests near the player", !!droppedEntry, JSON.stringify(droppedEntry));
const droppedY = await page.evaluate(() => {
  const dbg = window.__mpDebug().pickups;
  return null; // y not exposed; use render text layout instead
});
const floorY = await page.evaluate((idx) => {
  const s = JSON.parse(window.render_game_to_text());
  const entry = s.layout.find((l) => l.id === `weapon-${idx}`);
  return entry ? entry.worldPosition.y : null;
}, heldWeapon?.toLowerCase());
check("dropped scanner sits at floor height", floorY !== null && floorY > 0.3 && floorY < 0.7, `y=${floorY}`);

// 3. Re-pickup the dropped scanner.
await page.keyboard.press("e");
await page.waitForTimeout(350);
s = await state();
check("dropped scanner can be picked up again", s.weapon === heldWeapon, JSON.stringify(s.weapon));

// 4. Rapid pick-drop-pick abuse: no stuck state, no console errors.
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
for (let i = 0; i < 4; i += 1) {
  await page.keyboard.press("q");
  await page.waitForTimeout(120);
  await page.keyboard.press("e");
  await page.waitForTimeout(120);
}
s = await state();
check("rapid drop/pick cycles stay consistent", s.weapon === heldWeapon, JSON.stringify(s.weapon));

// 5. Same-frame drop/re-pick race: the stale pickup animation must not eat
// the mesh. Drop again after it would have finished and verify the device
// is still visible in the world and collectible.
await page.keyboard.press("q");
await page.keyboard.press("e"); // immediate re-pick, inside the old anim's first frames
await page.waitForTimeout(1400); // long past the stale animation's lifetime
await page.keyboard.press("q");
await page.waitForTimeout(900);
const raceEntry = await page.evaluate((idx) => {
  const s = JSON.parse(window.render_game_to_text());
  const entry = s.layout.find((l) => l.id === `weapon-${idx}`);
  return entry ? entry.worldPosition : null;
}, heldWeapon?.toLowerCase());
check("device survives same-frame drop/re-pick race", raceEntry !== null && raceEntry.y > 0.3 && raceEntry.y < 0.7, JSON.stringify(raceEntry));
await page.keyboard.press("e");
await page.waitForTimeout(350);
s = await state();
check("device still collectible after the race", s.weapon === heldWeapon, JSON.stringify(s.weapon));

// 6. Holding Q must drop exactly one device, not the whole inventory.
await page.keyboard.press("e");
await page.waitForTimeout(200);
const slotsBefore = (await state()).collected.length;
await page.keyboard.down("q");
await page.waitForTimeout(1200); // OS key repeat would fire many times
await page.keyboard.up("q");
s = await state();
check("held Q drops only one device", s.collected.length === Math.max(0, slotsBefore - 1), `collected=${JSON.stringify(s.collected)}`);
check("no page errors during weapon churn", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
