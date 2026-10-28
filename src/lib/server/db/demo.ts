import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { TableDef } from "../../types";
import { DatabaseError, type ConnectionTestResult, type DatabaseAdapter, type ExecuteOptions, type RawResult } from "./adapter";
import { executeLimited, inReadOnlyTransaction, introspectSchema, toDatabaseError, type Runner } from "./pg-common";

/**
 * Demo mode: an in-process PostgreSQL (PGlite) loaded with the sample dataset from
 * db/demo-seed.sql. Used only when DATABASE_URL is not set, and always labelled as demo data.
 */
export class DemoAdapter implements DatabaseAdapter {
  readonly dialect = "postgresql" as const;
  readonly mode = "demo" as const;
  private db: Promise<PGlite> | null = null;
  // PGlite has a single connection, so requests must not interleave transactions.
  private queue: Promise<unknown> = Promise.resolve();

  private open(): Promise<PGlite> {
    this.db ??= (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const seed = await readFile(path.join(process.cwd(), "db", "demo-seed.sql"), "utf8");
      const db = new PGlite();
      await db.exec(seed);
      return db;
    })().catch((err) => {
      this.db = null;
      console.error("[demo] failed to start demo database", (err as Error).message);
      throw new DatabaseError("demo_unavailable", "The demo database could not be started.", 503);
    });
    return this.db;
  }

  private exclusive<T>(fn: (r: Runner) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.open();
      const r: Runner = {
        async query(text, values) {
          const res = await db.query<unknown[]>(text, values, { rowMode: "array" });
          return { rows: res.rows, fields: res.fields };
        },
      };
      try {
        return await fn(r);
      } catch (err) {
        throw toDatabaseError(err);
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async test(): Promise<ConnectionTestResult> {
    const started = performance.now();
    const tables = await this.introspect();
    return { latencyMs: Math.round(performance.now() - started), tableCount: tables.length, warnings: [] };
  }

  execute(sql: string, { rowLimit, timeoutMs }: ExecuteOptions): Promise<RawResult> {
    const work = this.exclusive((r) => inReadOnlyTransaction(r, timeoutMs, () => executeLimited(r, sql, rowLimit)));
    // PGlite runs in-process, so also enforce the timeout from the outside.
    return Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new DatabaseError("timeout", "That question took too long to answer. Try asking for something more specific.", 408)),
          timeoutMs + 1_000,
        ),
      ),
    ]);
  }

  introspect(): Promise<TableDef[]> {
    return this.exclusive((r) => inReadOnlyTransaction(r, null, () => introspectSchema(r)));
  }

  async close(): Promise<void> {
    const db = await this.db?.catch(() => null);
    await db?.close();
    this.db = null;
  }
}
