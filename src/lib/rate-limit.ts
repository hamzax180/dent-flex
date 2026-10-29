import { prisma } from "./db";
import { ApiError } from "./errors";

/**
 * Fixed-window rate limit stored in PostgreSQL so it holds across web instances.
 * Good enough for a single clinic; put a reverse-proxy limit in front in production.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  const since = new Date(Date.now() - windowSeconds * 1000);
  const count = await prisma.rateLimitHit.count({ where: { bucket, createdAt: { gte: since } } });
  if (count >= limit) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
  }
  await prisma.rateLimitHit.create({ data: { bucket } });
}

export function clientIp(req: Request): string {
  // Trust only the first hop set by our own reverse proxy.
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim().slice(0, 64);
}
