// Render chosen frames of the promo stage to PNG for review.
import { chromium } from "playwright";
const [stage, fmt, outDir, ...times] = process.argv.slice(2);
const land = fmt === "land";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: land ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(`file://${stage}?fmt=${fmt}`);
await page.evaluate(() => window.ready);
for (const t of times) {
  await page.evaluate((t) => window.seek(t), Number(t));
  await page.screenshot({ path: `${outDir}/${fmt}-${String(t).padStart(5, "0")}.png` });
}
console.log("errors:", errs.length ? errs.slice(0, 5) : "none");
await browser.close();
