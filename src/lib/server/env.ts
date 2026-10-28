import "server-only";
import { isDialect } from "../dialects";
import type { Dialect } from "../types";

/**
 * Server-only configuration. Read lazily so values are never inlined into client bundles,
 * and never prefixed with NEXT_PUBLIC_.
 */
function intEnv(name: string, fallback: number, min: number, max: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
}

export function llmConfig() {
  const baseUrl = (process.env.FREELLMAPI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.FREELLMAPI_API_KEY ?? "").trim();
  return {
    baseUrl,
    apiKey,
    defaultModel: (process.env.FREELLMAPI_MODEL ?? "").trim() || "auto",
    timeoutMs: intEnv("FREELLMAPI_TIMEOUT_MS", 45_000, 5_000, 120_000),
    configured: baseUrl.length > 0 && apiKey.length > 0,
    baseUrlIsLocal: /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(baseUrl),
  };
}

export function databaseConfig(): { url: string | null; dialect: Dialect } {
  const url = (process.env.DATABASE_URL ?? "").trim() || null;
  const d = (process.env.DATABASE_DIALECT ?? "postgresql").trim();
  return { url, dialect: isDialect(d) ? d : "postgresql" };
}

export function executionLimits() {
  return {
    maxRowLimit: intEnv("QUERY_MAX_ROW_LIMIT", 500, 1, 5_000),
    statementTimeoutMs: intEnv("QUERY_TIMEOUT_MS", 10_000, 1_000, 60_000),
  };
}
