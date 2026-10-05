// Renders a local HTML file to a PNG (design review and icon export helper).
// Usage: node scripts/render-html.mjs <in.html> <out.png> [width] [height] [scale]
//   With a height, captures exactly width x height (e.g. 180 180 1 for an app icon);
//   without one, captures the full page.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [input, output, width = "1200", height, scale = "2"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(width), height: Number(height ?? 800) },
  deviceScaleFactor: Number(scale),
});
await page.goto(pathToFileURL(path.resolve(input)).href);
await page.waitForTimeout(1500); // web fonts
await page.screenshot({ path: output, fullPage: !height });
await browser.close();
console.log(output);
