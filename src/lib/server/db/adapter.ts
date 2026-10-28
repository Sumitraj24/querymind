import "server-only";
import type { DataMode, Dialect, TableDef } from "../../types";

export interface RawColumn {
  name: string;
  /** PostgreSQL type OID, when known. */
  dataTypeID: number | null;
}

export interface RawResult {
  columns: RawColumn[];
  rows: unknown[][];
  truncated: boolean;
  durationMs: number;
  rowLimit: number;
}

export interface ConnectionTestResult {
  latencyMs: number;
  tableCount: number;
  warnings: string[];
}

export interface ExecuteOptions {
  rowLimit: number;
  timeoutMs: number;
}

/**
 * One adapter per database engine. New dialects plug in by implementing this
 * interface and registering in ./index.ts.
 */
export interface DatabaseAdapter {
  readonly dialect: Dialect;
  readonly mode: DataMode;
  test(): Promise<ConnectionTestResult>;
  execute(sql: string, options: ExecuteOptions): Promise<RawResult>;
  introspect(): Promise<TableDef[]>;
  close(): Promise<void>;
}

/**
 * Database errors. `message` is always safe to show the user. `detail` holds the
 * engine's own error text for the model's repair attempt; it is never sent to the client.
 */
export class DatabaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}
