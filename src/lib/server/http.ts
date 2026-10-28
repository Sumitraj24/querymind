import "server-only";
import { z } from "zod";
import type { ApiErrorBody } from "../types";
import { LlmError } from "./llm-client";
import { DatabaseError } from "./db/adapter";

const MAX_BODY_BYTES = 512 * 1024;

export function jsonError(
  status: number,
  code: string,
  message: string,
  extra: { retryAfterSeconds?: number; details?: unknown } = {},
): Response {
  const body: ApiErrorBody = { error: { code, message, ...extra } };
  const headers: HeadersInit = extra.retryAfterSeconds ? { "Retry-After": String(extra.retryAfterSeconds) } : {};
  return Response.json(body, { status, headers });
}

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Read and validate a JSON request body. Throws RequestError on bad input. */
export async function readBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new RequestError(413, "payload_too_large", "The request body is too large.");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) throw new RequestError(413, "payload_too_large", "The request body is too large.");
    raw = text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof RequestError) throw err;
    throw new RequestError(400, "invalid_json", "The request body must be valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new RequestError(
      400,
      "invalid_request",
      parsed.error.issues[0] ? `${parsed.error.issues[0].path.join(".") || "body"}: ${parsed.error.issues[0].message}` : "Invalid request.",
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return parsed.data;
}

/** Convert any thrown error into a safe JSON response. Unknown errors are logged, not exposed. */
export function handleError(err: unknown): Response {
  if (err instanceof RequestError) {
    const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
    return retry
      ? jsonError(err.status, err.code, err.message, { retryAfterSeconds: retry })
      : jsonError(err.status, err.code, err.message, { details: err.details });
  }
  if (err instanceof LlmError) {
    return jsonError(err.status, err.code, err.message, { retryAfterSeconds: err.retryAfterSeconds });
  }
  if (err instanceof DatabaseError) return jsonError(err.status, err.code, err.message);
  console.error("[api] unhandled error", err);
  return jsonError(500, "internal_error", "Something went wrong on the server. Please try again.");
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per server instance). On serverless hosts each
// instance has its own counters, so treat this as abuse damping, not a hard quota.
// ---------------------------------------------------------------------------
const buckets = new Map<string, number[]>();

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip") || "local";
}

export function rateLimit(req: Request, scope: string, limit: number, windowMs = 60_000): void {
  const key = `${scope}:${clientKey(req)}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    const retry = Math.ceil((windowMs - (now - hits[0])) / 1000);
    throw new RequestError(429, "rate_limited", `Too many requests. Try again in ${retry} seconds.`, { retryAfterSeconds: retry });
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
}
