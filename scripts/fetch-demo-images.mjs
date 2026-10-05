// Finds public-domain / CC0 photos on Wikimedia Commons for the demo catalogue,
// downloads them into public/demo/, and records sources in public/demo/credits.json.
// Usage: node scripts/fetch-demo-images.mjs [slug ...]   (no args = all missing)
//        PICK_<slug_with_underscores>=n  picks the n-th candidate instead of the first.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("public/demo");
mkdirSync(OUT, { recursive: true });

// slug -> search queries (first query with a free-licence match wins)
const SUBJECTS = {
  "speckled-stoneware-mug": ["stoneware cup pottery", "handmade pottery cup", "ceramic cup handmade"],
  "celadon-serving-bowl": ["celadon bowl", "celadon ware bowl"],
  "raku-bud-vase": ["studio pottery vase", "stoneware vase glaze", "ceramic vase glazed"],
  "hand-thrown-pour-over-set": ["stoneware jug", "pottery jug glazed", "ceramic pitcher"],
  "silver-hammered-ring": ["silver ring", "silver rings jewellery", "handmade silver jewelry"],
  "ceramic-bead-necklace": ["bead necklace", "glass bead necklace", "beaded necklace"],
  "indigo-linen-throw": ["indigo dyed textile", "shibori indigo"],
  "handwoven-wool-scarf": ["handwoven wool scarf", "woven wool textile"],
  "block-printed-tea-towels-set-of-3": ["block printed textile", "hand block printing fabric"],
  "walnut-serving-board": ["wooden chopping board", "bread board wood", "wooden cutting boards"],
  "carved-cherry-spoon": ["wooden spoons", "wooden spoon kitchen", "spoon carving wood"],
  "oak-jewelry-box": ["wooden jewelry box", "wooden box handmade"],
  "anagama-wood-fired-moon-jar": ["moon jar", "wood fired pottery jar"],
  "heirloom-tapestry-wall-hanging": ["woven tapestry wall hanging", "handwoven tapestry"],
  "burl-maple-keepsake-bowl": ["wooden bowl", "turned wood bowl", "woodturning bowl"],
  "ash-glazed-tea-bowl": ["tea bowl chawan", "ash glaze bowl"],
  // material tiles on the home page
  "material-clay": ["potter at work wheel", "pottery making hands clay", "potter wheel"],
  "material-fiber": ["weaving loom yarn", "skeins of wool yarn", "handloom weaving"],
  "material-wood": ["woodworking chisel carving", "wood carving tools"],
  "material-metal": ["goldsmith at work", "jeweller workbench", "silversmith hammer"],
};

const FREE = /^(cc0|cc-zero|public domain|pd|pdm)/i;
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "artisan-market-demo/1.0 (local dev seed)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with polite pacing and retry on 429 (Wikimedia rate-limits bursts). */
async function getWithRetry(url) {
  for (let attempt = 0; ; attempt++) {
    await sleep(2000);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429 || attempt >= 6) return res;
    const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 15_000 * (attempt + 1);
    console.log(`  rate limited, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
}

async function search(query) {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "25",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "1000",
  });
  const res = await getWithRetry(`${API}?${params}`);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = await res.json();
  return Object.values(data.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .map((p) => {
      const ii = p.imageinfo?.[0];
      const meta = ii?.extmetadata ?? {};
      return {
        title: p.title,
        mime: ii?.mime,
        width: ii?.width,
        thumb: ii?.thumburl,
        page: ii?.descriptionurl,
        license: meta.LicenseShortName?.value ?? "",
        artist: (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim(),
      };
    })
    .filter((f) => f.thumb && f.mime === "image/jpeg" && f.width >= 800 && FREE.test(f.license))
    // Skip museum drawings/engravings and off-topic hits that searches tend to surface.
    .filter((f) => !/NGA \d|PSM V|Google Art Project|drawing|engraving|ribbon cutting|launch|marriage|map of|archival|Dura-Europos|negative number|paella|cooking/i.test(f.title));
}

const creditsFile = path.join(OUT, "credits.json");
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, "utf8")) : {};
const args = process.argv.slice(2);
const wanted = args.length ? args : Object.keys(SUBJECTS).filter((s) => !existsSync(path.join(OUT, `${s}.jpg`)));

for (const slug of wanted) {
  const used = new Set(Object.entries(credits).filter(([k]) => k !== slug).map(([, c]) => c.page));
  const pick = Number(process.env[`PICK_${slug.replace(/-/g, "_")}`] ?? 0);
  let picked = null;
  for (const q of SUBJECTS[slug]) {
    const found = (await search(q)).filter((f) => !used.has(f.page));
    picked = found[pick] ?? found[0];
    if (picked) break;
  }
  if (!picked) {
    console.log(`- ${slug}: no free image found`);
    continue;
  }
  const img = await getWithRetry(picked.thumb);
  if (!img.ok) {
    console.log(`- ${slug}: download failed (${img.status})`);
    continue;
  }
  writeFileSync(path.join(OUT, `${slug}.jpg`), Buffer.from(await img.arrayBuffer()));
  credits[slug] = { file: `${slug}.jpg`, title: picked.title, license: picked.license, artist: picked.artist, page: picked.page };
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + "\n");
  console.log(`+ ${slug}: ${picked.title} (${picked.license})`);
}
