import { chromium } from "playwright";
const [html, out] = process.argv.slice(2);
const b = await chromium.launch();
for (const [w, dsf, name] of [[680, 2, "d"], [390, 2, "m"]]) {
  const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: dsf });
  await p.goto("file://" + html);
  await p.screenshot({ path: `${out}/${name}/brief.png`, fullPage: true });
  await p.close();
}
await b.close();
console.log("ok");
