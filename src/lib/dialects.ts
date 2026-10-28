import type { Dialect } from "./types";

export interface DialectInfo {
  id: Dialect;
  label: string;
  /** node-sql-parser `database` option */
  parser: "PostgresQL" | "MySQL" | "Sqlite" | "TransactSQL";
  /** sql-formatter `language` option */
  formatter: "postgresql" | "mysql" | "sqlite" | "transactsql";
  /** Whether QueryMind can execute queries for this dialect. */
  executable: boolean;
  limitHint: string;
}

export const DIALECTS: Record<Dialect, DialectInfo> = {
  postgresql: {
    id: "postgresql",
    label: "PostgreSQL",
    parser: "PostgresQL",
    formatter: "postgresql",
    executable: true,
    limitHint: "Use LIMIT n for row limits and date_trunc / to_char for dates.",
  },
  mysql: {
    id: "mysql",
    label: "MySQL",
    parser: "MySQL",
    formatter: "mysql",
    executable: false,
    limitHint: "Use LIMIT n for row limits and DATE_FORMAT for dates.",
  },
  sqlite: {
    id: "sqlite",
    label: "SQLite",
    parser: "Sqlite",
    formatter: "sqlite",
    executable: false,
    limitHint: "Use LIMIT n for row limits and strftime for dates.",
  },
  sqlserver: {
    id: "sqlserver",
    label: "SQL Server",
    parser: "TransactSQL",
    formatter: "transactsql",
    executable: false,
    limitHint: "Use SELECT TOP (n) for row limits (never LIMIT) and FORMAT / DATEFROMPARTS for dates.",
  },
};

export const DIALECT_LIST = Object.values(DIALECTS);

export function isDialect(value: unknown): value is Dialect {
  return typeof value === "string" && value in DIALECTS;
}
