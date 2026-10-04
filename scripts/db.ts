// Runs a local Postgres 17 cluster from the embedded-postgres npm package.
// Data lives in ./.pgdata (gitignored).
//
//   npx tsx scripts/db.ts          start (or reuse a healthy running cluster) and stay up
//   npx tsx scripts/db.ts stop     shut the cluster down cleanly
//   npx tsx scripts/db.ts check    exit 0 if the database answers queries, else 1
//
// On Windows, closing the console window can kill the postmaster while one of its
// children (e.g. the checkpointer) survives holding port 5432. The port then looks
// open but nothing answers. Before starting we therefore clear any leftover
// postgres.exe from THIS project's binaries and any stale postmaster.pid.
import EmbeddedPostgres from "embedded-postgres";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const databaseDir = path.resolve(".pgdata");
const pidFile = path.join(databaseDir, "postmaster.pid");
const port = Number(process.env.PGPORT ?? 5432);
const DATABASES = [
  "artisan",
  "artisan_test",
  // one dev + test database per parallel worktree
  ...["shop", "auction", "admin"].flatMap((w) => [`artisan_${w}`, `artisan_${w}_test`]),
];
const isWindows = process.platform === "win32";
const binDir = path.resolve(
  "node_modules/@embedded-postgres",
  `${isWindows ? "windows" : process.platform}-${process.arch}`,
  "native/bin",
);

const cluster = new EmbeddedPostgres({
  databaseDir,
  user: "app",
  password: "app",
  port,
  persistent: true,
  onLog: () => {},
});

/** True if Postgres on `port` actually answers a query. */
async function healthy(): Promise<boolean> {
  const client = new pg.Client({
    connectionString: `postgresql://app:app@localhost:${port}/postgres`,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Stops leftover postgres processes that run this project's binaries (Windows). */
function killLeftovers() {
  if (!isWindows) return;
  const script = `
    $dir = '${binDir.replace(/'/g, "''")}'
    Get-CimInstance Win32_Process -Filter "Name='postgres.exe' or Name='pg_ctl.exe'" |
      Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, 'OrdinalIgnoreCase') } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $_.ProcessId }`;
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  }).trim();
  if (out) console.log(`Stopped leftover Postgres processes: ${out.split(/\s+/).join(", ")}`);
}

function removeStalePidFile() {
  if (existsSync(pidFile)) {
    rmSync(pidFile, { force: true });
    console.log("Removed stale postmaster.pid");
  }
}

/** Graceful shutdown via pg_ctl (works whoever started the cluster). */
function pgCtlStop() {
  const pgCtl = path.join(binDir, isWindows ? "pg_ctl.exe" : "pg_ctl");
  if (!existsSync(pidFile)) return false;
  try {
    execFileSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w", "-t", "20"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function start() {
  if (await healthy()) {
    console.log(`Postgres is already running on port ${port}.`);
    return;
  }
  // Port may be held by a half-dead cluster from a previous run: clean up first.
  killLeftovers();
  removeStalePidFile();

  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log("Initialising cluster in", databaseDir);
    await cluster.initialise();
  }
  await cluster.start();

  const client = cluster.getPgClient();
  await client.connect();
  const { rows } = await client.query<{ datname: string }>("SELECT datname FROM pg_database");
  const existing = new Set(rows.map((r) => r.datname));
  await client.end();
  for (const db of DATABASES) {
    if (!existing.has(db)) {
      await cluster.createDatabase(db);
      console.log("Created database", db);
    }
  }

  console.log(`Postgres ready on postgresql://app:app@localhost:${port}/{${DATABASES.join(",")}}`);
  console.log("Leave this window open. To stop cleanly, run stop.bat (or press Ctrl+C here).");

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("Stopping Postgres...");
    await cluster.stop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Windows sends SIGHUP when the console window is closed (~10s before a hard kill).
  process.on("SIGHUP", shutdown);
}

async function stop() {
  const graceful = pgCtlStop();
  killLeftovers();
  removeStalePidFile();
  console.log(graceful ? "Postgres stopped." : "Postgres was not running cleanly; cleared leftovers.");
}

const command = process.argv[2] ?? "start";
const run = command === "stop" ? stop : command === "check" ? async () => process.exit((await healthy()) ? 0 : 1) : start;

run().catch(async (err) => {
  console.error(err);
  await cluster.stop().catch(() => {});
  process.exit(1);
});
