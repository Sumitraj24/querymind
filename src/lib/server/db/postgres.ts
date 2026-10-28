import "server-only";
import { Pool, type PoolClient } from "pg";
import type { TableDef } from "../../types";
import type { ConnectionTestResult, DatabaseAdapter, ExecuteOptions, RawResult } from "./adapter";
import { executeLimited, inReadOnlyTransaction, introspectSchema, toDatabaseError, type Runner } from "./pg-common";

const CONNECT_TIMEOUT_MS = 8_000;

function runner(c: PoolClient): Runner {
  return {
    async query(text, values) {
      const res = await c.query({ text, values, rowMode: "array" });
      return { rows: res.rows as unknown[][], fields: res.fields };
    },
  };
}

/** Live PostgreSQL connection from DATABASE_URL. */
export class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = "postgresql" as const;
  readonly mode = "live" as const;
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 4,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 30_000,
      // Client-side backstop for a hung network connection, on top of the server's
      // statement_timeout (max 60s) and the 20s introspection limit.
      query_timeout: 65_000,
    });
    // Idle client errors (e.g. a server restart) must not crash the process.
    this.pool.on("error", () => console.error("[db] idle client error"));
  }

  private async withRunner<T>(fn: (r: Runner) => Promise<T>): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (err) {
      throw toDatabaseError(err);
    }
    try {
      return await fn(runner(client));
    } catch (err) {
      throw toDatabaseError(err);
    } finally {
      client.release();
    }
  }

  async test(): Promise<ConnectionTestResult> {
    const started = performance.now();
    return this.withRunner(async (r) => {
      const info = await r.query(
        `SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user),
                (SELECT count(*) FROM information_schema.table_privileges
                  WHERE grantee = current_user AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE'))::int,
                (SELECT count(*) FROM information_schema.tables
                  WHERE table_schema NOT IN ('pg_catalog','information_schema'))::int`,
      );
      const [superuser, writeGrants, tableCount] = info.rows[0] as [boolean, number, number];
      const warnings: string[] = [];
      if (superuser) warnings.push("The database account is a superuser. Use a dedicated read-only account.");
      else if (writeGrants > 0) warnings.push("The database account has write privileges. A read-only account is strongly recommended.");
      return { latencyMs: Math.round(performance.now() - started), tableCount, warnings };
    });
  }

  execute(sql: string, { rowLimit, timeoutMs }: ExecuteOptions): Promise<RawResult> {
    return this.withRunner((r) => inReadOnlyTransaction(r, timeoutMs, () => executeLimited(r, sql, rowLimit)));
  }

  introspect(): Promise<TableDef[]> {
    return this.withRunner((r) => inReadOnlyTransaction(r, 20_000, () => introspectSchema(r)));
  }

  async close(): Promise<void> {
    await this.pool.end().catch(() => undefined);
  }
}
