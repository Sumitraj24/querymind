import "server-only";
import type { ColumnDef, TableDef } from "../../types";
import { DatabaseError, type RawResult } from "./adapter";

/** Minimal query interface shared by node-postgres clients and PGlite. */
export interface Runner {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[][]; fields: { name: string; dataTypeID: number }[] }>;
}

/** Map PostgreSQL error codes to friendly messages. Engine text goes to `detail` only. */
export function toDatabaseError(err: unknown): DatabaseError {
  if (err instanceof DatabaseError) return err;
  const e = err as { code?: string; message?: string };
  const detail = e?.message;
  switch (e?.code) {
    case "57014":
      return new DatabaseError("timeout", "That question took too long to answer. Try asking for something more specific.", 408);
    case "25006":
      return new DatabaseError("read_only_violation", "QueryMind can only read data. It cannot change or delete records.", 400);
    case "42501":
      return new DatabaseError("permission_denied", "The database account isn't allowed to read the data needed for that question.", 403);
    case "28P01":
    case "28000":
      return new DatabaseError("db_auth_failed", "The server could not sign in to the database. Check DATABASE_URL.", 502);
    case "3D000":
      return new DatabaseError("db_not_found", "The configured database does not exist. Check DATABASE_URL.", 502);
    case "ECONNREFUSED":
    case "ENOTFOUND":
    case "EHOSTUNREACH":
    case "ETIMEDOUT":
      return new DatabaseError("db_unreachable", "The database is not reachable right now. Please try again later.", 503);
  }
  if (e?.code && /^(42|22|21|23)/.test(e.code)) {
    // Syntax / semantic errors in the generated query. The caller may ask the model to repair it.
    return new DatabaseError("query_error", "I couldn't find an answer to that question in the database. Try rephrasing it.", 422, detail);
  }
  if (/query read timeout/i.test(detail ?? "")) {
    return new DatabaseError("db_timeout", "The database took too long to respond. Please try again.", 504);
  }
  if (/timeout|timed out/i.test(detail ?? "")) {
    return new DatabaseError("db_unreachable", "Timed out connecting to the database. Please try again later.", 503);
  }
  if (/ssl|certificate/i.test(detail ?? "")) {
    return new DatabaseError("db_ssl", "The server could not open a secure connection to the database. Check the SSL settings in DATABASE_URL.", 502);
  }
  console.error("[db] unexpected database error", e?.code ?? "no-code");
  return new DatabaseError("db_error", "The database returned an unexpected error. Please try again.", 502);
}

export function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return `[binary ${v.length} bytes]`;
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === "object") return JSON.parse(JSON.stringify(v));
  return v;
}

function stripTrailingSemicolons(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "").trim();
}

/**
 * Run `fn` inside a READ ONLY transaction that is always rolled back.
 * The database itself then rejects any write, as a second line of defence after the parser.
 */
export async function inReadOnlyTransaction<T>(r: Runner, timeoutMs: number | null, fn: () => Promise<T>): Promise<T> {
  await r.query("BEGIN TRANSACTION READ ONLY");
  try {
    if (timeoutMs) await r.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
    return await fn();
  } finally {
    await r.query("ROLLBACK").catch(() => undefined);
  }
}

/** Execute an already-validated SELECT with a hard row cap. */
export async function executeLimited(r: Runner, sql: string, rowLimit: number): Promise<RawResult> {
  const started = performance.now();
  // The newline before ")" keeps a trailing "-- comment" from swallowing the parenthesis.
  const res = await r.query(`SELECT * FROM (\n${stripTrailingSemicolons(sql)}\n) AS querymind_result LIMIT $1`, [rowLimit + 1]);
  const durationMs = Math.round(performance.now() - started);
  const truncated = res.rows.length > rowLimit;
  const rows = truncated ? res.rows.slice(0, rowLimit) : res.rows;
  return {
    columns: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: rows.map((row) => row.map(serializeValue)),
    truncated,
    durationMs,
    rowLimit,
  };
}

const COLUMNS_SQL = `
SELECT c.table_schema, c.table_name, c.column_name,
       CASE WHEN c.data_type = 'character varying' AND c.character_maximum_length IS NOT NULL
            THEN 'varchar(' || c.character_maximum_length || ')'
            WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL
            THEN 'numeric(' || c.numeric_precision || ',' || COALESCE(c.numeric_scale, 0) || ')'
            WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
            ELSE c.data_type END AS data_type,
       c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
  AND c.table_schema NOT LIKE 'pg_%'
  AND t.table_type IN ('BASE TABLE', 'VIEW')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
LIMIT 5000`;

const KEYS_SQL = `
SELECT tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_type,
       ccu.table_name AS ref_table, ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_type = 'FOREIGN KEY'
 AND ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema
WHERE tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE')
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')`;

const COMMENTS_SQL = `
SELECT n.nspname AS table_schema, c.relname AS table_name, obj_description(c.oid, 'pg_class') AS comment
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'v') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND obj_description(c.oid, 'pg_class') IS NOT NULL`;

/** Read tables, columns, keys and table comments from information_schema. */
export async function introspectSchema(r: Runner): Promise<TableDef[]> {
  const cols = await r.query(COLUMNS_SQL);
  const keys = await r.query(KEYS_SQL);
  const comments = await r.query(COMMENTS_SQL).catch(() => ({ rows: [] as unknown[][] }));

  const schemas = new Set(cols.rows.map((row) => String(row[0])));
  const qualify = (schema: string, table: string) => (schemas.size > 1 && schema !== "public" ? `${schema}.${table}` : table);

  const tables = new Map<string, TableDef>();
  for (const [schema, table, column, type, nullable] of cols.rows as string[][]) {
    const key = `${schema}.${table}`;
    let t = tables.get(key);
    if (!t) {
      if (tables.size >= 300) continue;
      t = { name: qualify(schema, table), columns: [] };
      tables.set(key, t);
    }
    t.columns.push({ name: column, type, nullable: nullable === "YES" });
  }
  for (const [schema, table, column, kind, refTable, refColumn] of keys.rows as (string | null)[][]) {
    const col: ColumnDef | undefined = tables.get(`${schema}.${table}`)?.columns.find((c) => c.name === column);
    if (!col) continue;
    if (kind === "PRIMARY KEY") col.primaryKey = true;
    else if (kind === "UNIQUE") col.unique = true;
    else if (refTable && refColumn) col.references = { table: refTable, column: refColumn };
  }
  for (const [schema, table, comment] of comments.rows as string[][]) {
    const t = tables.get(`${schema}.${table}`);
    if (t && comment) t.description = comment.slice(0, 300);
  }
  return [...tables.values()];
}
