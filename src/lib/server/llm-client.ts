import "server-only";
import { llmConfig } from "./env";

export type LlmErrorCode =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unreachable"
  | "model_not_found"
  | "upstream_error"
  | "invalid_response"
  | "empty_response";

const STATUS_FOR: Record<LlmErrorCode, number> = {
  not_configured: 503,
  unauthorized: 502,
  rate_limited: 429,
  timeout: 504,
  unreachable: 502,
  model_not_found: 400,
  upstream_error: 502,
  invalid_response: 502,
  empty_response: 502,
};

export class LlmError extends Error {
  readonly status: number;
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LlmError";
    this.status = STATUS_FOR[code];
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  /** FreeLLMAPI reports the provider/model it routed to in the X-Routed-Via header. */
  routedVia: string | null;
}

function requireConfig() {
  const cfg = llmConfig();
  if (!cfg.configured) {
    throw new LlmError(
      "not_configured",
      "The AI model is not configured. Set FREELLMAPI_BASE_URL and FREELLMAPI_API_KEY on the server.",
    );
  }
  return cfg;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(1, Math.ceil(secs));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

async function request(path: string, init: RequestInit, timeoutMs?: number): Promise<Response> {
  const cfg = requireConfig();
  const timeout = timeoutMs ?? cfg.timeoutMs;
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new LlmError("timeout", `The AI model did not respond within ${Math.round(timeout / 1000)} seconds. Try again.`);
    }
    const hint = cfg.baseUrlIsLocal
      ? " FREELLMAPI_BASE_URL points at localhost: make sure FreeLLMAPI is running on this machine. A deployed site cannot reach localhost on your computer."
      : "";
    throw new LlmError("unreachable", `Could not reach the AI provider.${hint}`);
  }

  if (res.ok) return res;

  // The body is only inspected for classification. It is never logged (providers may echo
  // the prompt back) and never forwarded to the client.
  const body = await res.text().catch(() => "");
  console.error(`[llm] ${init.method ?? "GET"} ${path} -> HTTP ${res.status}`);

  if (res.status === 401 || res.status === 403) {
    throw new LlmError("unauthorized", "The AI provider rejected the server's API key. Check FREELLMAPI_API_KEY.");
  }
  if (res.status === 429) {
    const retry = parseRetryAfter(res.headers.get("retry-after"));
    throw new LlmError(
      "rate_limited",
      `The AI provider is rate limiting requests. ${retry ? `Try again in ${retry} seconds.` : "Wait a moment and try again."}`,
      retry,
    );
  }
  if (res.status === 404 && /model/i.test(body)) {
    throw new LlmError("model_not_found", "The selected model is not available. Choose another model in Settings.");
  }
  if (res.status === 400 && /model/i.test(body)) {
    throw new LlmError("model_not_found", "The AI provider did not accept the selected model. Choose another model in Settings.");
  }
  if (res.status === 408 || res.status === 504) {
    throw new LlmError("timeout", "The AI provider timed out. Try again.");
  }
  throw new LlmError("upstream_error", `The AI provider returned an error (HTTP ${res.status}). Try again shortly.`);
}

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const cfg = requireConfig();
  const model = opts.model?.trim() || cfg.defaultModel;
  const res = await request("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 1200,
      stream: false,
    }),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new LlmError("invalid_response", "The AI provider returned a response that could not be read.");
  }
  const choice = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== "string") {
    throw new LlmError("invalid_response", "The AI provider returned an unexpected response format.");
  }
  if (!content.trim()) {
    throw new LlmError("empty_response", "The AI model returned an empty answer. Try rephrasing or retrying.");
  }
  const reportedModel = (data as { model?: unknown }).model;
  return {
    content,
    model: typeof reportedModel === "string" && reportedModel ? reportedModel : model,
    routedVia: res.headers.get("x-routed-via"),
  };
}

export interface ModelInfo {
  id: string;
  ownedBy: string | null;
}

export async function listModels(timeoutMs = 8_000): Promise<ModelInfo[]> {
  const res = await request("/models", { method: "GET" }, timeoutMs);
  const data = (await res.json().catch(() => null)) as { data?: { id?: unknown; owned_by?: unknown }[] } | null;
  if (!data || !Array.isArray(data.data)) {
    throw new LlmError("invalid_response", "The AI provider returned an unexpected model list.");
  }
  return data.data
    .filter((m): m is { id: string; owned_by?: unknown } => typeof m?.id === "string")
    .map((m) => ({ id: m.id, ownedBy: typeof m.owned_by === "string" ? m.owned_by : null }));
}
