import type { Job } from "@prisma/client";
import { prisma } from "../db";
import { runJob, onJobDead, RescheduleJob } from "./engine";
import { PermanentSendError } from "./providers";

const LEASE_SECONDS = 300;
const JOB_TIMEOUT_MS = 60_000;

/**
 * Claim due jobs atomically. FOR UPDATE SKIP LOCKED lets several workers run safely;
 * a RUNNING job whose lease expired (crashed worker) becomes claimable again.
 */
export async function claimJobs(workerId: string, limit: number): Promise<Job[]> {
  return prisma.$queryRaw<Job[]>`
    UPDATE "Job" SET status = 'RUNNING', "lockedBy" = ${workerId},
      "lockedUntil" = now() + make_interval(secs => ${LEASE_SECONDS}), attempts = attempts + 1, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE (status IN ('PENDING', 'FAILED') AND "runAt" <= now())
         OR (status = 'RUNNING' AND "lockedUntil" < now())
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *`;
}

/** Exponential backoff with full jitter: ~30s, 1m, 2m, 4m… capped at 1h. */
export function backoffMs(attempt: number) {
  const cap = Math.min(3600_000, 30_000 * 2 ** Math.max(0, attempt - 1));
  return Math.floor(cap / 2 + Math.random() * (cap / 2));
}

export async function processJob(job: Job) {
  try {
    await Promise.race([
      runJob(job),
      new Promise((_, reject) => setTimeout(() => reject(new Error("job timeout")), JOB_TIMEOUT_MS)),
    ]);
    await prisma.job.update({ where: { id: job.id }, data: { status: "SUCCEEDED", lockedBy: null, lockedUntil: null, lastError: null } });
  } catch (err) {
    if (err instanceof RescheduleJob) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "PENDING", runAt: err.runAt, attempts: { decrement: 1 }, lockedBy: null, lockedUntil: null, lastError: `rescheduled: ${err.why}` },
      });
      return;
    }
    const message = err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 500) : "unknown error";
    const permanent = err instanceof PermanentSendError;
    if (permanent || job.attempts >= job.maxAttempts) {
      const dead = await prisma.job.update({ where: { id: job.id }, data: { status: "DEAD", lastError: message, lockedBy: null, lockedUntil: null } });
      await onJobDead(dead).catch((e) => console.error("onJobDead failed", e instanceof Error ? e.message : e));
    } else {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "FAILED", lastError: message, runAt: new Date(Date.now() + backoffMs(job.attempts)), lockedBy: null, lockedUntil: null },
      });
    }
  }
}

/** Drain everything that is due right now (used by tests and the dev "run jobs" button). */
export async function drainQueue(workerId = "inline", maxRounds = 50) {
  let processed = 0;
  for (let i = 0; i < maxRounds; i++) {
    const jobs = await claimJobs(workerId, 20);
    if (!jobs.length) break;
    for (const j of jobs) await processJob(j);
    processed += jobs.length;
  }
  return processed;
}
