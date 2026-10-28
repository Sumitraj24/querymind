import { describe, expect, it } from "vitest";
import { formatCell, toCsv } from "@/lib/client/format";
import { parseGeneration } from "@/lib/llm/parse";
import { relevantTables } from "@/lib/schema";
import type { ResultColumn, TableDef } from "@/lib/types";

describe("parseGeneration", () => {
  it("reads the requested JSON shape", () => {
    expect(parseGeneration('{"sql":"SELECT 1","reason":""}')).toEqual({ sql: "SELECT 1", reason: "" });
  });

  it("reads JSON wrapped in prose or code fences", () => {
    expect(parseGeneration('Here you go:\n```json\n{"sql": "SELECT 2"}\n```')?.sql).toBe("SELECT 2");
    expect(parseGeneration('Sure! {"sql": "SELECT 3", "reason": ""} Hope that helps.')?.sql).toBe("SELECT 3");
  });

  it("falls back to a ```sql block or a bare statement", () => {
    expect(parseGeneration("```sql\nSELECT 4\n```")?.sql).toBe("SELECT 4");
    expect(parseGeneration("WITH x AS (SELECT 1) SELECT * FROM x")?.sql).toMatch(/^WITH/);
  });

  it("keeps a refusal reason when sql is empty", () => {
    expect(parseGeneration('{"sql":"","reason":"No weather data"}')).toEqual({ sql: "", reason: "No weather data" });
  });

  it("returns null for unusable output", () => {
    expect(parseGeneration("I am not sure what you mean.")).toBeNull();
  });
});

describe("formatCell and toCsv", () => {
  const salary: ResultColumn = { name: "salary", label: "Salary", kind: "number", currency: true };
  const name: ResultColumn = { name: "name", label: "Name", kind: "text", currency: false };
  const opts = { locale: "en-IN", currency: "INR" };

  it("formats money in the chosen currency without needless decimals", () => {
    expect(formatCell("90000.00", salary, opts)).toBe("₹90,000");
    expect(formatCell("1234.5", salary, opts)).toBe("₹1,234.50");
    expect(formatCell(null, salary, opts)).toBe("—");
  });

  it("escapes CSV values and neutralises spreadsheet formulas", () => {
    const csv = toCsv([name, salary], [["Rahul, Jr.", "90000.00"], ['=HYPERLINK("x")', "-5"]]);
    const lines = csv.replace("﻿", "").split("\r\n");
    expect(lines[0]).toBe("Name,Salary");
    expect(lines[1]).toBe('"Rahul, Jr.",90000.00');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",-5`);
  });
});

describe("relevantTables", () => {
  const many: TableDef[] = Array.from({ length: 40 }, (_, i) => ({ name: `misc_${i}`, columns: [{ name: "id", type: "int" }] }));
  many.push(
    { name: "employees", columns: [{ name: "id", type: "int" }, { name: "department_id", type: "int", references: { table: "departments", column: "id" } }] },
    { name: "departments", columns: [{ name: "id", type: "int" }] },
  );

  it("sends small schemas whole", () => {
    expect(relevantTables("anything", many.slice(0, 5))).toHaveLength(5);
  });

  it("picks matching tables and their foreign-key neighbours from large schemas", () => {
    const names = relevantTables("top 5 employees by salary", many).map((t) => t.name);
    expect(names).toContain("employees");
    expect(names).toContain("departments");
    expect(names.length).toBeLessThanOrEqual(25);
  });
});
