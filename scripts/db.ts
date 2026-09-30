// Runs a local Postgres 17 cluster from the embedded-postgres npm package.
// Keeps running until Ctrl+C. Data lives in ./.pgdata (gitignored).
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const databaseDir = path.resolve(".pgdata");
const port = Number(process.env.PGPORT ?? 5432);
const DATABASES = ["artisan", "artisan_test"];

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "app",
  password: "app",
  port,
  persistent: true,
  onLog: () => {},
});

async function main() {
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log("Initialising cluster in", databaseDir);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const { rows } = await client.query<{ datname: string }>("SELECT datname FROM pg_database");
  const existing = new Set(rows.map((r) => r.datname));
  await client.end();
  for (const db of DATABASES) {
    if (!existing.has(db)) {
      await pg.createDatabase(db);
      console.log("Created database", db);
    }
  }

  console.log(`Postgres ready on postgresql://app:app@localhost:${port}/{${DATABASES.join(",")}}`);

  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(async (err) => {
  console.error(err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
