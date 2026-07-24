// Real-input test of the pause menu and balloon-currency shop.
// Requires the game served on :8765. Run: node tools/test-pause-shop.mjs
import { importGamePortStudioModule } from "./game-port-studio-path.mjs";

const { chromium } = await importGamePortStudioModule("playwright/index.mjs");
const results = [];
const check = (name, pass, detail = "") => results.push(`${pass ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
await context.addInitScript(() => {
  if (!localStorage.getItem("zebraBalloonWallet")) {
    localStorage.setItem("zebraBalloonWallet", JSON.stringify({ earned: 250, spent: 0, codes: [] }));
  }
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
await page.goto("http://127.0.0.1:8765/", { waitUntil: "domcontentloaded" });
await page.click("#play-btn");
await page.waitForSelector("#tut-go-btn", { state: "visible" });
await page.click("#tut-go-btn");
await page.mouse.click(450, 300);
await page.waitForTimeout(400);

const playerPos = () => page.evaluate(() => JSON.parse(window.render_game_to_text()).player);

// 1. P opens the pause overlay and freezes movement.
await page.keyboard.press("p");
const overlayShown = await page.evaluate(() => document.getElementById("pause-overlay").style.display === "flex");
check("P opens the pause overlay", overlayShown);
const posBefore = await playerPos();
await page.keyboard.down("w");
await page.waitForTimeout(600);
await page.keyboard.up("w");
const posDuring = await playerPos();
check("movement frozen while paused", Math.hypot(posDuring.x - posBefore.x, posDuring.z - posBefore.z) < 0.05);

// 2. Seeded balance renders; plush affordable, terminal not.
check("balance shows seeded 250", (await page.textContent("#wallet-balance")) === "250");
check("plush redeem enabled", await page.evaluate(() => !document.getElementById("shop-buy-plush").disabled));
const terminalState = await page.evaluate(() => { const b = document.getElementById("shop-buy-terminal"); return { disabled: b.disabled, text: b.textContent }; });
check("terminal locked with progress hint", terminalState.disabled && /NEED 9,?750 MORE/.test(terminalState.text), JSON.stringify(terminalState));

// 3. Two-step redeem: arm then confirm; balance drops, code appears.
await page.click("#shop-buy-plush");
check("first click arms confirmation", (await page.textContent("#shop-buy-plush")) === "CONFIRM?");
await page.click("#shop-buy-plush");
await page.waitForTimeout(200);
check("plush redeemed: balance 50", (await page.textContent("#wallet-balance")) === "50");
const code = await page.evaluate(() => document.querySelector("#wallet-codes .code-row")?.textContent ?? "");
check("redemption code issued", /ZC-PLUSH-[A-Z2-9]{4}-[A-Z2-9]{4}/.test(code), code);

// 4. Resume restores play; wallet HUD chip matches.
await page.click("#resume-btn");
check("resume hides overlay", await page.evaluate(() => document.getElementById("pause-overlay").style.display === "none"));
const posResume = await playerPos();
await page.keyboard.down("w");
await page.waitForTimeout(500);
await page.keyboard.up("w");
const posMoved = await playerPos();
check("movement works after resume", Math.hypot(posMoved.x - posResume.x, posMoved.z - posResume.z) > 0.4);
check("HUD chip shows 50", (await page.textContent("#wallet-hud")) === "50");

// 5. Persistence across reload.
await page.reload({ waitUntil: "domcontentloaded" });
await page.click("#play-btn");
await page.waitForSelector("#tut-go-btn", { state: "visible" });
await page.click("#tut-go-btn");
await page.waitForTimeout(300);
await page.click("#pause-btn");
check("balance persists after reload", (await page.textContent("#wallet-balance")) === "50");
const persistedCode = await page.evaluate(() => document.querySelector("#wallet-codes .code-row")?.textContent ?? "");
check("code persists after reload", /ZC-PLUSH-/.test(persistedCode));
check("pause button opens overlay", await page.evaluate(() => document.getElementById("pause-overlay").style.display === "flex"));
check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
