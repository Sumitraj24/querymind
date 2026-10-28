import type { ApiErrorBody, AskResponse, HealthResponse } from "../types";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const CLIENT_TIMEOUT_MS = 120_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw new ApiError("cancelled", "The request was cancelled.", 0);
    if ((err as Error)?.name === "TimeoutError") throw new ApiError("timeout", "The request took too long. Please try again.", 0);
    throw new ApiError("network", "Can't reach QueryMind. Check your internet connection and try again.", 0);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok || !body) {
    const e = body?.error;
    throw new ApiError(e?.code ?? "http_error", e?.message ?? `Something went wrong (HTTP ${res.status}).`, res.status, e?.retryAfterSeconds);
  }
  return body;
}

export const api = {
  ask: (question: string, opts: { model?: string; rowLimit?: number }, signal?: AbortSignal) =>
    call<AskResponse>("/api/ask", {
      method: "POST",
      body: JSON.stringify({ question, model: opts.model || undefined, rowLimit: opts.rowLimit }),
      signal,
    }),
  health: () => call<HealthResponse>("/api/health"),
  models: () => call<{ defaultModel: string; models: string[] }>("/api/models"),
  testDatabase: () =>
    call<{ mode: "live" | "demo"; latencyMs: number; tableCount: number; warnings: string[] }>("/api/database/test", {
      method: "POST",
    }),
};
