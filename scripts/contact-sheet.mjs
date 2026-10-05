// Renders public/demo/*.jpg as a labelled grid PNG for visual review.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
const dir = path.resolve("public/demo");
const out = process.argv[2] ?? "contact-sheet.png";
const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
const cells = files.map((f) => `<figure><img src="data:image/jpeg;base64,${readFileSync(path.join(dir, f)).toString("base64")}"><figcaption>${f}</figcaption></figure>`).join("");
const html = `<style>body{margin:0;font:12px sans-serif;display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:6px;background:#eee}figure{margin:0;background:#fff}img{width:100%;height:200px;object-fit:cover;display:block}figcaption{padding:3px}</style>${cells}`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.setContent(html); await p.screenshot({ path: out, fullPage: true }); await b.close(); console.log(out);
