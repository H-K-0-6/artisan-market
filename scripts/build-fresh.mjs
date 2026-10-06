// Exits 0 if the production build in .next is newer than every source file, 1 if
// `npm run build` is needed. Used by start.bat so it only rebuilds after code changes.
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const BUILD_ID = ".next/BUILD_ID";
const SOURCES = ["src", "public", "prisma/schema.prisma", "next.config.ts", "package-lock.json", "postcss.config.mjs", "tsconfig.json"];
const SKIP = new Set(["generated", "node_modules"]);

function newest(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const name of readdirSync(p)) {
    if (!SKIP.has(name)) max = Math.max(max, newest(path.join(p, name)));
  }
  return max;
}

if (!existsSync(BUILD_ID)) process.exit(1);
const built = statSync(BUILD_ID).mtimeMs;
process.exit(SOURCES.some((s) => newest(s) > built) ? 1 : 0);
