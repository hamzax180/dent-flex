// Local development PostgreSQL without Docker (uses the embedded-postgres package).
// Reads credentials from .env DATABASE_URL. Data lives in ./.pgdata (git-ignored).
// Production and Docker users should use `docker compose up -d db` instead.
import EmbeddedPostgres from "embedded-postgres";
import { readFileSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const url = new URL(env.DATABASE_URL);
const pg = new EmbeddedPostgres({
  databaseDir: "./.pgdata",
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port || 5432),
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});

if (!existsSync("./.pgdata/PG_VERSION")) await pg.initialise();
await pg.start();
for (const name of [url.pathname.slice(1), new URL(env.TEST_DATABASE_URL ?? env.DATABASE_URL).pathname.slice(1)]) {
  try {
    await pg.createDatabase(name);
  } catch {
    /* already exists */
  }
}
console.log(`PostgreSQL running on port ${url.port || 5432} (Ctrl+C to stop)`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
