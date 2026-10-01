// Recreates the E2E database from scratch: drop, create, migrate, seed.
// Run by playwright.config.ts before the server starts (DATABASE_URL is the e2e DB).
import { execSync } from "node:child_process";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL);
const dbName = url.pathname.slice(1);
if (!/^artisan_e2e\w*$/.test(dbName)) {
  throw new Error(`Refusing to recreate "${dbName}": E2E only recreates databases named artisan_e2e*`);
}

const admin = new URL(url);
admin.pathname = "/postgres";
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await client.query(`CREATE DATABASE "${dbName}"`);
await client.end();

const run = (cmd) => execSync(cmd, { stdio: "inherit", env: process.env });
run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts");
console.log(`[e2e] database ${dbName} ready`);
