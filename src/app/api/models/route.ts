import { connection } from "next/server";
import { llmConfig } from "@/lib/server/env";
import { handleError, jsonError } from "@/lib/server/http";
import { listModels } from "@/lib/server/llm-client";

/** Models offered by the configured FreeLLMAPI instance, plus its routing aliases. */
export async function GET() {
  await connection();
  const cfg = llmConfig();
  if (!cfg.configured) return jsonError(503, "not_configured", "The AI model is not configured on the server.");
  try {
    const models = await listModels();
    // FreeLLMAPI's router aliases. They may not appear in /v1/models.
    const aliases = ["auto", "auto:fast", "auto:smart"];
    const ids = [...new Set([cfg.defaultModel, ...aliases, ...models.map((m) => m.id)])];
    return Response.json({ defaultModel: cfg.defaultModel, models: ids }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
