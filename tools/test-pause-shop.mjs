// Functional smoke for the merged pause menu + balloon-bank shop.
// (Serra reworked the shop: score+balance readout, "buy 50 balloons for 1000
// points", PRIZES plushie 5000 / terminal 10000, plushie auto-award.) This
// asserts the menu opens, shows its readouts, and resumes cleanly - not the
// exact economy numbers, which are her tuning. Requires the game on :8765.
import { importGamePortStudioModule } from "./game-port-studio-path.mjs";

const { chromium } = await importGamePortStudioModule("playwright/index.mjs");
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
await context.addInitScript(() => {
  localStorage.setItem("zebraPlayerRegistered", "1"); // skip lead-capture sign-in
  localStorage.setItem("zebraBalloonWallet", JSON.stringify({ earned: 250, spent: 0, codes: [] }));
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8765/?mp=0", { waitUntil: "domcontentloaded" });
await page.click("#play-btn");
await page.waitForSelector("#tut-go-btn", { state: "visible", timeout: 15000 });
await page.click("#tut-go-btn");
await page.mouse.click(450, 300);
await page.waitForTimeout(400);

const playerPos = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).player);

// 1. P opens the pause overlay and freezes movement.
await page.keyboard.press("p");
check("P opens the pause overlay", await page.evaluate(() => document.getElementById("pause-overlay").style.display === "flex"));
const before = await playerPos();
await page.keyboard.down("w");
await page.waitForTimeout(500);
await page.keyboard.up("w");
const during = await playerPos();
check("movement frozen while paused", Math.hypot(during.x - before.x, during.z - before.z) < 0.05);

// 2. Shop readouts + items render.
check("balloon bank balance shows", ((await page.textContent("#wallet-balance")) || "").trim().length > 0);
check("score readout shows", await page.evaluate(() => !!document.getElementById("pause-score")));
check("buy-balloons card present", await page.evaluate(() => !!document.getElementById("buy-balloons-btn")));
check("plushie + terminal prizes present", await page.evaluate(() => {
  const t = document.getElementById("pause-panel").textContent;
  return /plush/i.test(t) && /terminal/i.test(t) && /5000/.test(t) && /10000/.test(t);
}));

// 3. Resume returns to play.
await page.click("#resume-btn");
check("resume hides overlay", await page.evaluate(() => document.getElementById("pause-overlay").style.display === "none"));
const resumePos = await playerPos();
await page.keyboard.down("w");
await page.waitForTimeout(500);
await page.keyboard.up("w");
const moved = await playerPos();
check("movement works after resume", Math.hypot(moved.x - resumePos.x, moved.z - resumePos.z) > 0.4);

// 4. Pause button (not just key) also opens it, and persistence across reload.
await page.reload({ waitUntil: "domcontentloaded" });
await page.click("#play-btn");
await page.waitForSelector("#tut-go-btn", { state: "visible", timeout: 15000 });
await page.click("#tut-go-btn");
await page.waitForTimeout(300);
await page.click("#pause-btn");
check("MENU button opens overlay", await page.evaluate(() => document.getElementById("pause-overlay").style.display === "flex"));
check("balance persists across reload", ((await page.textContent("#wallet-balance")) || "").includes("250"));
check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
