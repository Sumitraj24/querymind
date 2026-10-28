import "server-only";
import type { TableDef } from "../../types";
import { databaseConfig } from "../env";
import { DatabaseError, type DatabaseAdapter } from "./adapter";
import { DemoAdapter } from "./demo";
import { PostgresAdapter } from "./postgres";

export { DatabaseError } from "./adapter";

const SCHEMA_TTL_MS = 5 * 60_000;

// Reuse pools and the schema cache across requests (and hot reloads in development).
const g = globalThis as unknown as {
  __querymindDb?: { key: string; adapter: DatabaseAdapter; schema?: { at: number; tables: Promise<TableDef[]> } };
};

/**
 * The database questions are answered from: the configured DATABASE_URL, or the
 * built-in demo database when none is configured.
 */
export function getAdapter(): DatabaseAdapter {
  const { url, dialect } = databaseConfig();
  const key = url ? `${dialect}:${url}` : "demo";
  if (g.__querymindDb?.key === key) return g.__querymindDb.adapter;

  let adapter: DatabaseAdapter;
  if (!url) {
    adapter = new DemoAdapter();
  } else if (dialect === "postgresql") {
    adapter = new PostgresAdapter(url);
  } else {
    throw new DatabaseError("unsupported_dialect", `Connecting to ${dialect} databases is not supported yet.`, 501);
  }
  void g.__querymindDb?.adapter.close();
  g.__querymindDb = { key, adapter };
  return adapter;
}

/** Introspected schema, cached for a few minutes. Never sent to the browser. */
export async function getSchema(forceRefresh = false): Promise<TableDef[]> {
  const adapter = getAdapter();
  const entry = g.__querymindDb!;
  if (!forceRefresh && entry.schema && Date.now() - entry.schema.at < SCHEMA_TTL_MS) return entry.schema.tables;
  const tables = adapter.introspect();
  entry.schema = { at: Date.now(), tables };
  tables.catch(() => {
    if (entry.schema?.tables === tables) entry.schema = undefined;
  });
  return tables;
}
