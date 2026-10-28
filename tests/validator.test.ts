import { describe, expect, it } from "vitest";
import { validateSql } from "@/lib/sql/validator";
import type { TableDef } from "@/lib/types";

const pg = { dialect: "postgresql" as const };
const codes = (sql: string, opts: Parameters<typeof validateSql>[1] = pg) => validateSql(sql, opts).issues.map((i) => i.code);
const isValid = (sql: string, opts: Parameters<typeof validateSql>[1] = pg) => validateSql(sql, opts).valid;

const TABLES: TableDef[] = [
  { name: "customers", columns: [{ name: "id", type: "int" }, { name: "name", type: "text" }, { name: "balance", type: "numeric" }] },
  { name: "accounts", columns: [{ name: "id", type: "int" }, { name: "customer_id", type: "int", references: { table: "customers", column: "id" } }] },
];

describe("validateSql: allowed read-only queries", () => {
  it.each([
    "SELECT * FROM customers WHERE balance > 5000 ORDER BY balance DESC LIMIT 10",
    "SELECT c.name, COUNT(a.id) AS n FROM customers c LEFT JOIN accounts a ON a.customer_id = c.id GROUP BY c.name HAVING COUNT(a.id) > 1",
    "WITH rich AS (SELECT * FROM customers WHERE balance > 1000) SELECT name FROM rich",
    "SELECT name FROM customers WHERE id IN (SELECT customer_id FROM accounts)",
    "SELECT name FROM customers UNION SELECT 'x'",
    "SELECT date_trunc('month', now()) AS m",
    "SELECT * FROM customers;",
  ])("accepts %s", (sql) => {
    expect(validateSql(sql, pg)).toMatchObject({ valid: true, statementType: "select" });
  });

  it("accepts SQL Server TOP, MySQL and SQLite syntax", () => {
    expect(isValid("SELECT TOP 10 * FROM customers ORDER BY balance DESC", { dialect: "sqlserver" })).toBe(true);
    expect(isValid("SELECT * FROM customers LIMIT 5", { dialect: "mysql" })).toBe(true);
    expect(isValid("SELECT strftime('%Y-%m', created_at) AS m FROM t", { dialect: "sqlite" })).toBe(true);
  });
});

describe("validateSql: rejected statements", () => {
  it.each([
    ["INSERT INTO customers (name) VALUES ('x')", "write_operation"],
    ["UPDATE customers SET balance = 0", "write_operation"],
    ["DELETE FROM customers", "write_operation"],
    ["DROP TABLE customers", "write_operation"],
    ["ALTER TABLE customers ADD COLUMN x int", "write_operation"],
    ["TRUNCATE customers", "write_operation"],
    ["CREATE TABLE x (id int)", "write_operation"],
    ["GRANT SELECT ON customers TO public", "write_operation"],
  ])("rejects %s", (sql, code) => {
    const r = validateSql(sql, pg);
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain(code);
  });

  it("rejects multiple statements, even if the first is a SELECT", () => {
    const r = validateSql("SELECT 1; DROP TABLE customers", pg);
    expect(r.valid).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("multiple_statements");
    expect(r.issues.map((i) => i.code)).toContain("nested_write_operation");
  });

  it("fails closed on a data-modifying CTE the parser cannot read", () => {
    expect(isValid("WITH x AS (DELETE FROM customers RETURNING *) SELECT * FROM x")).toBe(false);
  });

  it("rejects SELECT INTO", () => {
    expect(codes("SELECT * INTO backup FROM customers")).toContain("select_into");
  });

  it.each(["SELECT pg_sleep(10)", "SELECT nextval('seq')", "SELECT dblink('host=x', 'select 1')", "SELECT pg_read_file('/etc/passwd')", "SELECT query_to_xml('delete from t', true, true, '')"])(
    "rejects dangerous function: %s",
    (sql) => {
      expect(codes(sql)).toContain("forbidden_function");
    },
  );

  it("rejects dangerous functions nested inside subqueries", () => {
    expect(codes("SELECT * FROM customers WHERE id IN (SELECT 1 FROM (SELECT pg_sleep(5)) s)")).toContain("forbidden_function");
  });

  it("rejects empty, unparseable and oversized input", () => {
    expect(codes("   ")).toContain("empty");
    expect(codes("SELEC * FRM customers")).toContain("parse_error");
    expect(codes(`SELECT '${"x".repeat(20_001)}'`)).toContain("too_long");
  });
});

describe("validateSql: schema checks", () => {
  const opts = { dialect: "postgresql" as const, tables: TABLES };

  it("warns about unknown tables and columns", () => {
    expect(codes("SELECT * FROM orders", opts)).toContain("unknown_table");
    expect(codes("SELECT c.email FROM customers c", opts)).toContain("unknown_column");
  });

  it("does not flag CTE names or select aliases", () => {
    const r = validateSql("WITH rich AS (SELECT name, balance AS total FROM customers) SELECT name FROM rich ORDER BY name", opts);
    expect(r.issues.filter((i) => i.code.startsWith("unknown_"))).toEqual([]);
  });

  it("reports a missing LIMIT as info only", () => {
    const r = validateSql("SELECT name FROM customers", opts);
    expect(r.valid).toBe(true);
    expect(r.issues).toContainEqual(expect.objectContaining({ code: "no_limit", severity: "info" }));
  });
});
