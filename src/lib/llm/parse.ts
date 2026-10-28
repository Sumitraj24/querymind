export interface ParsedGeneration {
  sql: string;
  /** Why the model declined, when sql is empty. */
  reason: string;
}

function stripFences(text: string): string {
  const fence = /```(?:json|sql)?\s*([\s\S]*?)```/i.exec(text);
  return (fence ? fence[1] : text).trim();
}

/** Extract the outermost JSON object from text that may contain surrounding prose. */
function extractJsonObject(text: string): Record<string, unknown> | null {
  const candidates = [text.trim(), stripFences(text)];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function normalizeSql(sql: string): string {
  return sql
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * Parse a model completion into SQL. Accepts the requested JSON shape and falls back to
 * a fenced ```sql block or a bare SELECT/WITH statement. Returns null when nothing usable is found.
 */
export function parseGeneration(content: string): ParsedGeneration | null {
  const obj = extractJsonObject(content);
  if (obj && ("sql" in obj || "reason" in obj)) {
    return {
      sql: typeof obj.sql === "string" ? normalizeSql(obj.sql) : "",
      reason: typeof obj.reason === "string" ? obj.reason.trim() : "",
    };
  }
  const fenced = /```sql\s*([\s\S]*?)```/i.exec(content);
  if (fenced) return { sql: normalizeSql(fenced[1]), reason: "" };
  const bare = content.trim();
  if (/^(select|with)\b/i.test(bare)) return { sql: normalizeSql(bare), reason: "" };
  return null;
}
