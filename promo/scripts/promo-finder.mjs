// Re-shoot the email-finder panel with the app's own "Jane Doe" example.
import { chromium } from "playwright";
import fs from "node:fs";
const [OUT, BOXFILE] = process.argv.slice(2);
const B = "http://localhost:3100", JOB = "/jobs/ca25795b-f2a5-4c7d-98cf-bcb2228b6171";
const boxes = JSON.parse(fs.readFileSync(BOXFILE, "utf8"));
const browser = await chromium.launch();
for (const kind of ["d", "m"]) {
  const ctx = await browser.newContext(kind === "d"
    ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5, timezoneId: "America/Edmonton", locale: "en-CA" }
    : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, timezoneId: "America/Edmonton", locale: "en-CA" });
  await ctx.addInitScript(() => { const add = () => { const s = document.createElement("style"); s.textContent = ".demo-banner{display:none!important}"; document.head.appendChild(s); }; if (document.head) add(); else document.addEventListener("DOMContentLoaded", add); });
  const page = await ctx.newPage();
  await page.goto(B + "/login", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /demo/i }).first().click();
  await page.waitForURL(/dashboard/);
  await page.goto(B + JOB, { waitUntil: "networkidle" });
  await page.waitForSelector(".kit-tabs");
  await page.getByRole("tab", { name: "Find their email" }).click();
  await page.getByPlaceholder("https://www.linkedin.com/in/jane-doe-12ab34").fill("https://www.linkedin.com/in/jane-doe-12ab34");
  await page.getByRole("button", { name: /Find likely emails/ }).click();
  await page.waitForSelector(".finder-list li", { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.addStyleTag({ content: ".bar,.app-nav{position:static!important}" });
  await page.locator(".kit").scrollIntoViewIfNeeded();
  await page.locator(".kit").screenshot({ path: `${OUT}/${kind}/kit-finder.png` });
  const c = await page.locator(".kit").boundingBox();
  const f = await page.locator(".finder-list li").first().boundingBox();
  boxes[kind]["kit-finder"].first = { x: +((f.x - c.x) / c.width).toFixed(4), y: +((f.y - c.y) / c.height).toFixed(4), w: +(f.width / c.width).toFixed(4), h: +(f.height / c.height).toFixed(4) };
  console.log(kind, (await page.locator(".finder-list li .info b").allTextContents()).slice(0, 3).join(", "));
  await ctx.close();
}
fs.writeFileSync(BOXFILE, JSON.stringify(boxes, null, 1));
await browser.close();
