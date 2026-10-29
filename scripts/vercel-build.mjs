// Vercel build: generate the Prisma client, apply migrations, seed, then build Next.js.
// Migrations use the direct (unpooled) connection when the host provides one (e.g. Neon).
import { execSync } from "node:child_process";

const run = (cmd, env = process.env) => execSync(cmd, { stdio: "inherit", env });

run("npx prisma generate");
if (process.env.DATABASE_URL) {
  const direct = { ...process.env, DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL };
  run("npx prisma migrate deploy", direct);
  // The seed is idempotent. Only run it with a real admin password, never the demo default.
  if ((process.env.SEED_ADMIN_PASSWORD ?? "").trim().length >= 12 && process.env.SEED_ADMIN_EMAIL?.trim()) run("npx tsx prisma/seed.ts", direct);
  else {
    console.warn(
      `[vercel-build] skipping seed: SEED_ADMIN_EMAIL length ${(process.env.SEED_ADMIN_EMAIL ?? "").length}, ` +
        `SEED_ADMIN_PASSWORD length ${(process.env.SEED_ADMIN_PASSWORD ?? "").length} (needs an email and a 12+ character password).`,
    );
  }
} else {
  console.warn("[vercel-build] DATABASE_URL is not set; skipping migrations.");
}
run("npx next build");
