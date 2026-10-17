import { chromium } from "playwright";
const [OUT, which = "d,m"] = process.argv.slice(2);
const B = "http://localhost:3100";
const JOB = "/jobs/ca25795b-f2a5-4c7d-98cf-bcb2228b6171";
const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(kind) {
  const desktop = kind === "d";
  const ctx = await browser.newContext(
    desktop
      ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1.5, colorScheme: "light", reducedMotion: "no-preference", timezoneId: "America/Edmonton", locale: "en-CA" }
      : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "light", timezoneId: "America/Edmonton", locale: "en-CA" },
  );
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: B });
  // Promo framing: no demo-only banner, and a static header so tall element
  // captures don't get the sticky bar stamped into them.
  await ctx.addInitScript(() => {
    const css = ".demo-banner{display:none!important}";
    const add = () => { const s = document.createElement("style"); s.id = "promo-css"; s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener("DOMContentLoaded", add);
  });
  const page = await ctx.newPage();
  const staticBars = (on) => page.evaluate((on) => {
    let s = document.getElementById("promo-static");
    if (on && !s) { s = document.createElement("style"); s.id = "promo-static"; s.textContent = ".bar,.app-nav{position:static!important}"; document.head.appendChild(s); }
    if (!on && s) s.remove();
  }, on);
  const dir = `${OUT}/${kind}`;
  const shot = async (name, opts = {}) => {
    await wait(opts.wait ?? 700);
    if (opts.el) await staticBars(true);
    await (opts.el ? page.locator(opts.el).first().screenshot({ path: `${dir}/${name}.png` }) : page.screenshot({ path: `${dir}/${name}.png`, fullPage: !!opts.full }));
    if (opts.el) await staticBars(false);
    console.log(kind, name);
  };
  const go = async (path, w = "networkidle") => page.goto(B + path, { waitUntil: w });

  await go("/");
  await shot("landing", { wait: 1800 });
  await shot("landing-full", { full: true });
  await go("/login");
  await shot("login");

  // Demo sign-in → dashboard opens the sorting pop-up
  await page.getByRole("button", { name: /demo/i }).first().click();
  await page.waitForURL(/dashboard/);
  await page.waitForSelector(".triage .swipe-card", { timeout: 15000 }).catch(() => null);
  if (await page.locator(".triage").count()) {
    await shot("triage", { wait: 1200 });
    const card = page.locator(".swipe-card:not(.ghost)").first();
    const box = await card.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    for (const [name, dx, dy] of [["triage-apply", 140, 0], ["triage-super", 0, -140], ["triage-pass", -140, 0]]) {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
      await shot(name, { wait: 250 });
      await page.mouse.move(cx, cy, { steps: 8 });
      await page.mouse.up();
      await wait(500);
    }
    await page.keyboard.press("Escape");
    await wait(600);
  }
  await go("/dashboard");
  if (await page.locator(".triage").count()) { await page.keyboard.press("Escape"); await wait(500); }
  await shot("dashboard", { wait: 1500 });
  await shot("dashboard-full", { full: true, wait: 1500 });

  await go("/jobs");
  await shot("jobs");
  await shot("jobs-full", { full: true });
  await go("/jobs?status=not_interested");
  await shot("archive");

  await go(JOB);
  await page.waitForSelector(".kit-tabs", { timeout: 20000 });
  await shot("job");
  await shot("job-full", { full: true, wait: 1500 });
  await page.locator(".kit").scrollIntoViewIfNeeded();
  await shot("kit-cover", { el: ".kit", wait: 1500 });
  await page.getByRole("tab", { name: "Tailored resume" }).click();
  await shot("kit-resume", { el: ".kit" });
  await page.getByRole("tab", { name: "Follow-up & thank-you" }).click();
  await shot("kit-followup", { el: ".kit" });
  await page.getByRole("button", { name: "Thank you after an interview" }).click();
  await page.getByPlaceholder(/the plan to move/).fill("the Power BI rollout").catch(() => {});
  await shot("kit-thanks", { el: ".kit" });
  await page.getByRole("tab", { name: "Find their email" }).click();
  await page.getByPlaceholder("https://www.linkedin.com/in/jane-doe-12ab34").fill("https://www.linkedin.com/in/priya-shah-4b2a91");
  await shot("kit-finder-form", { el: ".kit" });
  await page.getByRole("button", { name: /Find likely emails/ }).click();
  await page.waitForSelector(".finder-list li", { timeout: 30000 }).catch(() => null);
  await shot("kit-finder", { el: ".kit", wait: 800 });
  await page.getByRole("tab", { name: "Interview prep" }).click();
  await shot("kit-interview", { el: ".kit" });

  await go("/jobs/new");
  await shot("addjob");
  await go("/documents");
  await shot("documents");
  await go("/alerts");
  await shot("alerts");
  await go("/settings");
  await shot("settings");
  await shot("settings-full", { full: true });
  await page.locator("#data").scrollIntoViewIfNeeded();
  await shot("settings-data", { el: "#data" });
  await go("/privacy");
  await shot("privacy");

  // Set-up wizard (demo can't save, so nothing is created)
  await go("/onboarding");
  await page.fill("#role", "Data Analyst");
  await shot("onb-0");
  await shot("onb-0-card", { el: ".panel:has(.steps-bar)" });
  await page.getByRole("button", { name: "Next →" }).click();
  await page.fill("#city", "Calgary, AB");
  await shot("onb-1");
  await shot("onb-1-card", { el: ".panel:has(.steps-bar)" });
  await page.getByRole("button", { name: "Next →" }).click();
  await wait(1500);
  const floor = page.locator("button.linklike", { hasText: /floor/i });
  if (await floor.count()) await floor.first().click();
  await page.fill("#exclude_keywords", "senior, director");
  await shot("onb-2", { wait: 900 });
  await shot("onb-2-card", { el: ".panel:has(.steps-bar)" });
  await page.getByRole("button", { name: /Next →|Skip →/ }).click();
  await shot("onb-3");
  await shot("onb-3-card", { el: ".panel:has(.steps-bar)" });
  await shot("onb-3-full", { full: true });
  await page.getByRole("button", { name: "Next →" }).click();
  await shot("onb-4");
  await shot("onb-4-card", { el: ".panel:has(.steps-bar)" });
  await page.getByRole("button", { name: "Next →" }).click();
  await shot("onb-5");
  await shot("onb-5-card", { el: ".panel:has(.steps-bar)" });

  // Dark mode
  await page.emulateMedia({ colorScheme: "dark" });
  await go("/dashboard");
  if (await page.locator(".triage").count()) { await page.keyboard.press("Escape"); await wait(500); }
  await shot("dashboard-dark", { wait: 1500 });
  await go(JOB);
  await page.waitForSelector(".kit-tabs", { timeout: 20000 });
  await shot("job-dark", { wait: 1200 });
  await go("/");
  await shot("landing-dark", { wait: 1800 });
  await ctx.close();
}
for (const k of which.split(",")) await run(k);
await browser.close();
