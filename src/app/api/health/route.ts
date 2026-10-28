import { connection } from "next/server";
import { getAdapter, getSchema } from "@/lib/server/db";
import { llmConfig } from "@/lib/server/env";
import { LlmError, listModels } from "@/lib/server/llm-client";
import type { HealthResponse } from "@/lib/types";

/** Status for the UI. Reports what is configured and reachable, never how (no URLs or keys). */
export async function GET() {
  await connection();
  const cfg = llmConfig();

  const llm: HealthResponse["llm"] = {
    configured: cfg.configured,
    reachable: null,
    defaultModel: cfg.configured ? cfg.defaultModel : null,
    message: cfg.configured ? "" : "The AI model is not configured on the server.",
  };
  const database: HealthResponse["database"] = {
    mode: "demo",
    connected: null,
    tableCount: null,
    message: "",
  };

  await Promise.all([
    (async () => {
      if (!cfg.configured) return;
      try {
        await listModels(5_000);
        llm.reachable = true;
        llm.message = "Connected";
      } catch (err) {
        llm.reachable = false;
        llm.message = err instanceof LlmError ? err.message : "The AI provider could not be reached.";
      }
    })(),
    (async () => {
      try {
        const adapter = getAdapter();
        database.mode = adapter.mode;
        const tables = await getSchema();
        database.connected = true;
        database.tableCount = tables.length;
        database.message = adapter.mode === "demo" ? "Using built-in sample data" : "Connected";
      } catch (err) {
        database.connected = false;
        database.message =
          err instanceof Error && err.name === "DatabaseError" ? err.message : "The database could not be reached.";
      }
    })(),
  ]);

  const body: HealthResponse = { llm, database, version: "1.0.0" };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
