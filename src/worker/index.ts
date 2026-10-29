/* Background worker: run with `npm run worker` (separate process from the web app). */
import { hostname } from "node:os";
import { prisma } from "../lib/db";
import { claimJobs, processJob } from "../lib/automation/queue";
import { emitEvent } from "../lib/jobs";

const WORKER_ID = `${hostname()}:${process.pid}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
const POLL_MS = 2000;

let stopping = false;
const inFlight = new Set<Promise<void>>();

/** Emit task.overdue once per task so workflows can react. */
async function scanOverdueTasks() {
  const overdue = await prisma.task.findMany({ where: { status: "OPEN", dueAt: { lt: new Date() } }, select: { id: true, leadId: true }, take: 200 });
  for (const t of overdue) {
    await prisma.$transaction((tx) => emitEvent(tx, { type: "task.overdue", dedupeKey: `task.overdue:${t.id}`, leadId: t.leadId, payload: { taskId: t.id } }));
  }
}

async function loop() {
  console.info(`[worker ${WORKER_ID}] started, concurrency=${CONCURRENCY}`);
  let lastScan = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastScan > 60_000) {
        lastScan = Date.now();
        await scanOverdueTasks();
      }
      const free = CONCURRENCY - inFlight.size;
      const jobs = free > 0 ? await claimJobs(WORKER_ID, free) : [];
      for (const job of jobs) {
        const p = processJob(job).finally(() => inFlight.delete(p));
        inFlight.add(p);
      }
      if (!jobs.length) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (err) {
      console.error(`[worker] loop error:`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, POLL_MS * 2));
    }
  }
  await Promise.allSettled([...inFlight]);
  await prisma.$disconnect();
  console.info(`[worker ${WORKER_ID}] stopped cleanly`);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.info(`[worker] ${sig} received, finishing in-flight jobs…`);
    stopping = true;
  });
}

void loop();
