// Vercel build: generate the Prisma client, apply migrations, then build Next.js.
// Migrations use the direct (unpooled) connection when the host provides one (e.g. Neon).
import { execSync } from "node:child_process";

const run = (cmd, env = process.env) => execSync(cmd, { stdio: "inherit", env });

run("npx prisma generate");
if (process.env.DATABASE_URL) {
  run("npx prisma migrate deploy", { ...process.env, DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
} else {
  console.warn("[vercel-build] DATABASE_URL is not set; skipping migrations.");
}
run("npx next build");
