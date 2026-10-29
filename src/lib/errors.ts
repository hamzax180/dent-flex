import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_TRANSITION"
  | "BUDGET_EXCEEDED"
  | "UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
  BUDGET_EXCEEDED: 429,
  UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function zodFields(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function errorResponse(err: unknown, requestId: string) {
  if (err instanceof ZodError) {
    err = new ApiError("VALIDATION_ERROR", "Please check the highlighted fields.", zodFields(err));
  }
  // Common database errors become clean client errors instead of 500s.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2023" || err.code === "P2025") err = new ApiError("NOT_FOUND", "Record not found.");
    else if (err.code === "P2002") err = new ApiError("CONFLICT", "That record already exists.");
    else if (err.code === "P2003") err = new ApiError("VALIDATION_ERROR", "A referenced record does not exist.");
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields, requestId } },
      { status: STATUS[err.code], headers: { "x-request-id": requestId } },
    );
  }
  // Never leak internals. Log only the error name/message, not request bodies.
  console.error(`[${requestId}] unhandled error:`, err instanceof Error ? `${err.name}: ${err.message}` : err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", requestId } },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

type Handler<C> = (req: Request, ctx: C & { requestId: string }) => Promise<Response>;

/** Wraps a route handler with request IDs and consistent JSON errors. */
export function route<C = { params: Promise<Record<string, string>> }>(handler: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    try {
      const res = await handler(req, { ...ctx, requestId });
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      return errorResponse(err, requestId);
    }
  };
}

export async function readJson(req: Request, maxBytes = 32_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError("VALIDATION_ERROR", "Request is too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}
