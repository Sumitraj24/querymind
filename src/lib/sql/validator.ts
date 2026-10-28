import type { Dialect, TableDef, ValidationIssue, ValidationResult } from "../types";
import { cleanParseError, getParser, isNode, parserOptions, walk, type AstNode } from "./parser";

export const MAX_SQL_LENGTH = 20_000;

/** Statement node types that write data or change the database. Checked at every depth. */
const FORBIDDEN_STATEMENT_TYPES = new Set([
  "insert",
  "update",
  "delete",
  "replace",
  "merge",
  "create",
  "drop",
  "alter",
  "truncate",
  "rename",
  "grant",
  "revoke",
  "lock",
  "unlock",
  "call",
  "exec",
  "execute",
  "transaction",
  "load_data",
  "copy",
  "use",
  "set",
  "vacuum",
  "comment",
]);

/**
 * Functions with side effects, file/network access, or that can run arbitrary SQL text.
 * Matched case-insensitively against the unqualified function name.
 */
const FORBIDDEN_FUNCTIONS = new Set([
  // PostgreSQL
  "pg_sleep",
  "pg_sleep_for",
  "pg_sleep_until",
  "pg_read_file",
  "pg_read_binary_file",
  "pg_ls_dir",
  "pg_stat_file",
  "pg_terminate_backend",
  "pg_cancel_backend",
  "pg_reload_conf",
  "pg_rotate_logfile",
  "pg_notify",
  "pg_advisory_lock",
  "pg_advisory_xact_lock",
  "pg_try_advisory_lock",
  "set_config",
  "nextval",
  "setval",
  "dblink",
  "dblink_exec",
  "dblink_connect",
  "query_to_xml",
  "query_to_xml_and_xmlschema",
  "query_to_json",
  "lo_import",
  "lo_export",
  "lo_unlink",
  "lo_create",
  "lo_from_bytea",
  "lo_put",
  // MySQL
  "sleep",
  "benchmark",
  "load_file",
  "get_lock",
  "release_lock",
  "sys_exec",
  "sys_eval",
  // SQL Server
  "xp_cmdshell",
  "openrowset",
  "opendatasource",
  "openquery",
]);

export interface ValidateOptions {
  dialect: Dialect;
  /** Tables available to the query. When given, unknown tables/columns are reported as warnings. */
  tables?: TableDef[];
}

function functionName(node: AstNode): string | null {
  const name = node.name;
  if (typeof name === "string") return name;
  if (isNode(name) && Array.isArray(name.name)) {
    const parts = name.name
      .map((p) => (isNode(p) && typeof p.value === "string" ? p.value : null))
      .filter((p): p is string => p !== null);
    return parts.length ? parts[parts.length - 1] : null;
  }
  return null;
}

function stripQualifier(name: string): string {
  const parts = name.split(".");
  return parts[parts.length - 1].replace(/^["`[]|["`\]]$/g, "");
}

/** Parse `type::schema::table` / `type::table::column` entries from node-sql-parser. */
function splitEntry(entry: string): [string, string | null, string] {
  const [op, mid, last] = entry.split("::");
  return [op, mid === "null" ? null : mid, last];
}

export function validateSql(sql: string, options: ValidateOptions): ValidationResult {
  const issues: ValidationIssue[] = [];
  const result = (statementType: string | null, tables: string[] = [], columns: string[] = []): ValidationResult => ({
    valid: !issues.some((i) => i.severity === "error"),
    statementType,
    issues,
    tables,
    columns,
  });

  const text = sql.trim();
  if (!text) {
    issues.push({ severity: "error", code: "empty", message: "Enter a SQL statement to validate." });
    return result(null);
  }
  if (text.length > MAX_SQL_LENGTH) {
    issues.push({
      severity: "error",
      code: "too_long",
      message: `The statement is longer than ${MAX_SQL_LENGTH.toLocaleString()} characters.`,
    });
    return result(null);
  }

  const parser = getParser();
  const opts = parserOptions(options.dialect);
  let ast: unknown;
  try {
    ast = parser.astify(text, opts);
  } catch (err) {
    // Fail closed: anything the parser can't understand is never treated as safe.
    issues.push({ severity: "error", code: "parse_error", message: cleanParseError(err) });
    return result(null);
  }

  const statements = (Array.isArray(ast) ? ast : [ast]).filter(isNode);
  if (statements.length === 0) {
    issues.push({ severity: "error", code: "empty", message: "No SQL statement was found." });
    return result(null);
  }
  if (statements.length > 1) {
    issues.push({
      severity: "error",
      code: "multiple_statements",
      message: `Found ${statements.length} statements. Only a single statement is allowed.`,
    });
  }

  const root = statements[0];
  const statementType = typeof root.type === "string" ? root.type.toLowerCase() : null;

  if (statementType !== "select") {
    const kind = (statementType ?? "unknown").toUpperCase();
    issues.push({
      severity: "error",
      code: FORBIDDEN_STATEMENT_TYPES.has(statementType ?? "") ? "write_operation" : "unsupported_statement",
      message: `${kind} statements are not allowed. Only read-only SELECT queries (including WITH … SELECT) are permitted.`,
    });
  }

  // Inspect every statement in full: CTE bodies, subqueries, set operations, and later statements.
  const reported = new Set<string>();
  const report = (issue: ValidationIssue) => {
    const key = `${issue.code}:${issue.message}`;
    if (!reported.has(key)) {
      reported.add(key);
      issues.push(issue);
    }
  };

  for (const stmt of statements) {
    walk(stmt, (node, key) => {
      const type = typeof node.type === "string" ? node.type.toLowerCase() : null;
      if (type && node !== root && FORBIDDEN_STATEMENT_TYPES.has(type) && key !== "column") {
        report({
          severity: "error",
          code: "nested_write_operation",
          message: `A nested ${type.toUpperCase()} statement was found (for example inside a CTE or subquery). Write operations are not allowed.`,
        });
      }
      if (type === "function" || type === "aggr_func" || type === "procedure") {
        const name = functionName(node);
        if (name && FORBIDDEN_FUNCTIONS.has(stripQualifier(name).toLowerCase())) {
          report({
            severity: "error",
            code: "forbidden_function",
            message: `The function ${stripQualifier(name)}() is not allowed because it has side effects or can access the server.`,
          });
        }
      }
      if (isNode(node.into) && (node.into.expr || node.into.type === "into")) {
        report({
          severity: "error",
          code: "select_into",
          message: "SELECT … INTO creates or writes to a table or variable and is not allowed.",
        });
      }
      const locking = node.locking_read ?? node.for_update;
      if (locking) {
        report({
          severity: "error",
          code: "locking_read",
          message: "Locking reads (FOR UPDATE / FOR SHARE) are not allowed.",
        });
      }
    });
  }

  // Table and column lists are informational and used for schema checks.
  let tables: string[] = [];
  let columns: string[] = [];
  try {
    tables = [...new Set(parser.tableList(text, opts).map((e) => splitEntry(e)[2]))];
    columns = [
      ...new Set(
        parser
          .columnList(text, opts)
          .map((e) => {
            const [, table, column] = splitEntry(e);
            return column === "(.*)" ? (table ? `${table}.*` : "*") : table ? `${table}.${column}` : column;
          }),
      ),
    ];
  } catch {
    // Non-fatal: the statement already parsed above.
  }

  if (options.tables && statementType === "select") {
    checkAgainstSchema(root, tables, columns, options.tables, report);
  }

  if (statementType === "select" && !hasRowLimit(root)) {
    report({
      severity: "info",
      code: "no_limit",
      message: "The query has no row limit. Execution will be capped at the configured row limit.",
    });
  }

  return result(statementType, tables, columns);
}

function hasRowLimit(root: AstNode): boolean {
  const limit = root.limit;
  if (isNode(limit) && Array.isArray(limit.value) && limit.value.length > 0) return true;
  if (isNode(root.top) && root.top.value != null) return true;
  return false;
}

function cteNames(root: AstNode): Set<string> {
  const names = new Set<string>();
  walk(root, (node, key) => {
    if (key !== "with" && !Array.isArray(node.with)) return;
    const list = Array.isArray(node.with) ? node.with : [];
    for (const w of list) {
      if (!isNode(w)) continue;
      const n = isNode(w.name) ? w.name.value : w.name;
      if (typeof n === "string") names.add(n.toLowerCase());
    }
  });
  return names;
}

function selectAliases(root: AstNode): Set<string> {
  const aliases = new Set<string>();
  walk(root, (node) => {
    if (typeof node.as === "string") aliases.add(node.as.toLowerCase());
    else if (isNode(node.as) && typeof node.as.value === "string") aliases.add(node.as.value.toLowerCase());
  });
  return aliases;
}

function checkAgainstSchema(
  root: AstNode,
  usedTables: string[],
  usedColumns: string[],
  schemaTables: TableDef[],
  report: (issue: ValidationIssue) => void,
) {
  const tableMap = new Map(schemaTables.map((t) => [t.name.toLowerCase(), t]));
  const ctes = cteNames(root);
  const aliases = selectAliases(root);

  for (const t of usedTables) {
    const key = t.toLowerCase();
    if (!tableMap.has(key) && !ctes.has(key)) {
      report({
        severity: "warning",
        code: "unknown_table",
        message: `Table "${t}" is not in the selected schema context.`,
      });
    }
  }

  const allColumns = new Set(schemaTables.flatMap((t) => t.columns.map((c) => c.name.toLowerCase())));
  for (const c of usedColumns) {
    if (c === "*" || c.endsWith(".*")) continue;
    const dot = c.lastIndexOf(".");
    const table = dot >= 0 ? c.slice(0, dot).toLowerCase() : null;
    const column = (dot >= 0 ? c.slice(dot + 1) : c).toLowerCase();
    if (table) {
      const def = tableMap.get(table);
      if (def && !def.columns.some((col) => col.name.toLowerCase() === column)) {
        report({
          severity: "warning",
          code: "unknown_column",
          message: `Column "${column}" does not exist on table "${def.name}".`,
        });
      }
    } else if (!allColumns.has(column) && !aliases.has(column)) {
      report({
        severity: "warning",
        code: "unknown_column",
        message: `Column "${column}" was not found in any table in the selected schema context.`,
      });
    }
  }
}
