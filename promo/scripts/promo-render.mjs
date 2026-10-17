// Render the promo stage frame by frame and pipe JPEG frames into ffmpeg.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const [stage, fmt, audio, out, fpsArg = "30", durArg = "60"] = process.argv.slice(2);
const fps = Number(fpsArg), dur = Number(durArg), land = fmt === "land";
const n = Math.round(fps * dur);
const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(fps), "-i", "-", "-i", audio,
  "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-profile:v", "high", "-r", String(fps),
  "-g", String(fps * 2), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: land ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`file://${stage}?fmt=${fmt}`);
await page.evaluate(() => window.ready);
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.seek(t), i / fps);
  const buf = await page.screenshot({ type: "jpeg", quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  if (i % 150 === 0) console.log(`${fmt} frame ${i}/${n} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
console.log(`${fmt} done in ${((Date.now() - t0) / 1000).toFixed(0)}s, page errors: ${errs.length}`);
await browser.close();
