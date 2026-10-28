export type Dialect = "postgresql" | "mysql" | "sqlite" | "sqlserver";

export interface ColumnDef {
  name: string;
  type: string;
  primaryKey?: boolean;
  nullable?: boolean;
  unique?: boolean;
  references?: { table: string; column: string };
  description?: string;
}

export interface TableDef {
  name: string;
  description?: string;
  columns: ColumnDef[];
}

// ---------------------------------------------------------------------------
// Server-internal validation types. These never leave the server.
// ---------------------------------------------------------------------------
export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
}

export interface ValidationResult {
  /** True when the statement parsed and passed the read-only policy. */
  valid: boolean;
  statementType: string | null;
  issues: ValidationIssue[];
  tables: string[];
  columns: string[];
}

// ---------------------------------------------------------------------------
// Client-visible API types. By design none of these carry SQL, prompts,
// credentials or schema definitions.
// ---------------------------------------------------------------------------
export type DataMode = "live" | "demo";

export type ColumnKind = "number" | "date" | "boolean" | "text" | "json";

export interface ResultColumn {
  /** Name as returned by the database (used for CSV headers). */
  name: string;
  /** Human-friendly header, e.g. "first_name" -> "First name". */
  label: string;
  kind: ColumnKind;
  /** True when the column looks like money (salary, balance, amount, price…). */
  currency: boolean;
}

export interface AskResponse {
  mode: DataMode;
  columns: ResultColumn[];
  /** Row values in column order (arrays keep duplicate column names distinct). */
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  rowLimit: number;
  durationMs: number;
  /** Plain-language notes safe to show, e.g. "Showing the first 500 rows." */
  notices: string[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    retryAfterSeconds?: number;
  };
}

export interface HealthResponse {
  llm: {
    configured: boolean;
    reachable: boolean | null;
    defaultModel: string | null;
    message: string;
  };
  database: {
    mode: DataMode;
    connected: boolean | null;
    tableCount: number | null;
    message: string;
  };
  version: string;
}

export type HistoryStatus = "answered" | "empty" | "failed";

export interface HistoryEntry {
  id: string;
  question: string;
  status: HistoryStatus;
  mode: DataMode;
  rowCount: number | null;
  error?: string;
  createdAt: string;
}

export interface SavedQuestion {
  id: string;
  name: string;
  question: string;
  createdAt: string;
  updatedAt: string;
}
