// Where key controls sit on each promo screenshot, as fractions of the image.
import { chromium } from "playwright";
import fs from "node:fs";
const [OUT] = process.argv.slice(2);
const B = "http://localhost:3100";
const JOB = "/jobs/ca25795b-f2a5-4c7d-98cf-bcb2228b6171";
const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const result = {};
async function run(kind) {
  const desktop = kind === "d";
  const ctx = await browser.newContext(desktop
    ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, timezoneId: "America/Edmonton", locale: "en-CA" }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: "America/Edmonton", locale: "en-CA" });
  await ctx.addInitScript(() => {
    const add = () => { const s = document.createElement("style"); s.textContent = ".demo-banner{display:none!important}"; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  });
  const page = await ctx.newPage();
  const R = (result[kind] = {});
  // rect of `sel` (union of all matches, or first n) relative to container/viewport, as fractions
  const box = async (shot, key, sel, container = null, n = 1) => {
    if (container) await page.addStyleTag({ content: ".bar,.app-nav{position:static!important}" });
    const loc = page.locator(sel);
    const count = Math.min(await loc.count(), n);
    let r = null;
    if (count) {
      const rs = [];
      for (let i = 0; i < count; i++) rs.push(await loc.nth(i).boundingBox());
      const vp = page.viewportSize();
      const c = container ? await page.locator(container).first().boundingBox() : { x: 0, y: 0, width: vp.width, height: vp.height };
      const l = Math.min(...rs.map((b) => b.x)), t = Math.min(...rs.map((b) => b.y));
      const rr = Math.max(...rs.map((b) => b.x + b.width)), bb = Math.max(...rs.map((b) => b.y + b.height));
      r = { x: (l - c.x) / c.width, y: (t - c.y) / c.height, w: (rr - l) / c.width, h: (bb - t) / c.height };
    }
    (R[shot] ??= {})[key] = r && Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(4)]));
  };
  const go = (p) => page.goto(B + p, { waitUntil: "networkidle" });
  await go("/login");
  await box("login", "google", "button:has-text('Continue with Google'), a:has-text('Continue with Google')");
  await page.getByRole("button", { name: /demo/i }).first().click();
  await page.waitForURL(/dashboard/);
  await wait(1500);
  if (await page.locator(".triage").count()) { await page.keyboard.press("Escape"); await wait(500); }
  await go("/dashboard"); await wait(800);
  if (await page.locator(".triage").count()) { await page.keyboard.press("Escape"); await wait(500); }
  await page.evaluate(() => scrollTo(0, 0));
  await box("dashboard", "find", "button:has-text('Find jobs now')");
  await box("dashboard", "banner", ".triage-banner");
  await box("dashboard", "sort", "button:has-text('Start sorting')");
  await go("/jobs");
  await box("jobs", "pay", ".pay", null, 4);
  await box("jobs", "rows", "table tbody tr", null, 4);
  await go(JOB); await page.waitForSelector(".kit-tabs");
  await page.evaluate(() => scrollTo(0, 0));
  await box("job", "pay", "h1 ~ * .pay, .pay", null, 1);
  await box("job", "fine", ".pay-fine", null, 1);
  await box("job", "tracker", "select[name='status']");
  await box("job", "trackerPanel", ".panel:has(select[name='status'])");
  await box("kit-cover", "score", ".kit-score", ".kit");
  await box("kit-cover", "chips", ".kit-chips", ".kit");
  await box("kit-cover", "word", "button:has-text('Download Word')", ".kit");
  await box("kit-cover", "letter", "textarea.kit-text", ".kit");
  await page.getByRole("tab", { name: "Tailored resume" }).click(); await wait(400);
  await box("kit-resume", "word", "button:has-text('Download Word')", ".kit");
  await box("kit-resume", "text", "textarea.kit-text", ".kit");
  await page.getByRole("tab", { name: "Follow-up & thank-you" }).click(); await wait(400);
  await box("kit-followup", "open", "a:has-text('Open in my email app')", ".kit");
  await box("kit-followup", "text", "textarea.kit-text", ".kit");
  await page.getByRole("button", { name: "Thank you after an interview" }).click(); await wait(300);
  await page.getByPlaceholder(/the plan to move/).fill("the Power BI rollout").catch(() => {});
  await box("kit-thanks", "open", "a:has-text('Open in my email app')", ".kit");
  await box("kit-thanks", "text", "textarea.kit-text", ".kit");
  await page.getByRole("tab", { name: "Find their email" }).click(); await wait(300);
  await page.getByPlaceholder("https://www.linkedin.com/in/jane-doe-12ab34").fill("https://www.linkedin.com/in/priya-shah-4b2a91");
  await page.getByRole("button", { name: /Find likely emails/ }).click();
  await page.waitForSelector(".finder-list li", { timeout: 30000 }).catch(() => null);
  await wait(600);
  await box("kit-finder", "first", ".finder-list li", ".kit", 1);
  await box("kit-finder", "list", ".finder-list li", ".kit", 4);
  await page.getByRole("tab", { name: "Interview prep" }).click(); await wait(400);
  await box("kit-interview", "ai", "a:has-text('Open ChatGPT'), a:has-text('Open Claude'), a:has-text('Open Gemini'), a:has-text('Open Grok')", ".kit", 4);
  await box("kit-interview", "prompt", "textarea.kit-prompt", ".kit");
  await go("/settings");
  await box("settings-data", "download", "#data a[href*='export']", "#data");
  await box("settings-data", "deletes", "#data .data-row button", "#data", 4);
  await box("settings-data", "account", "#data button:has-text('Delete my account')", "#data");
  await go("/onboarding");
  const card = ".panel:has(.steps-bar)";
  await page.fill("#role", "Data Analyst");
  await box("onb-0-card", "role", "#role", card);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.fill("#city", "Calgary, AB");
  await page.getByRole("button", { name: "Next →" }).click();
  await wait(1500);
  const floor = page.locator("button.linklike", { hasText: /floor/i });
  if (await floor.count()) await floor.first().click();
  await page.fill("#exclude_keywords", "senior, director");
  await box("onb-2-card", "typical", ".typical-pay", card);
  await box("onb-2-card", "salary", "#min_salary", card);
  await page.getByRole("button", { name: /Next →|Skip →/ }).click(); await wait(400);
  await box("onb-3-card", "freq", ".option", card, 3);
  await page.getByRole("button", { name: "Next →" }).click(); await wait(400);
  await box("onb-4-card", "channels", ".option", card, 3);
  await ctx.close();
}
await run("d"); await run("m");
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result).slice(0, 1500));
await browser.close();
