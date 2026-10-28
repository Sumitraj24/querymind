import type { TableDef } from "./types";

/** Compact, deterministic DDL-like rendering of the schema for the model prompt. */
export function schemaToPrompt(tables: TableDef[]): string {
  return tables
    .map((t) => {
      const cols = t.columns.map((c) => {
        const parts = [`  ${c.name} ${c.type}`];
        if (c.primaryKey) parts.push("PRIMARY KEY");
        if (c.nullable === false && !c.primaryKey) parts.push("NOT NULL");
        if (c.unique) parts.push("UNIQUE");
        if (c.references) parts.push(`REFERENCES ${c.references.table}(${c.references.column})`);
        let line = parts.join(" ");
        if (c.description) line += ` -- ${c.description}`;
        return line;
      });
      const header = t.description ? `-- ${t.description}\n` : "";
      return `${header}TABLE ${t.name} (\n${cols.join(",\n")}\n)`;
    })
    .join("\n\n");
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "for", "by", "with", "and", "or", "in", "on", "to", "from", "show", "find", "list",
  "get", "give", "me", "all", "each", "every", "how", "many", "much", "what", "which", "who", "is", "are",
  "top", "highest", "lowest", "most", "least", "count", "total", "average", "per", "their", "have", "has",
]);

function stem(word: string): string {
  return word.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
}

/**
 * Pick the tables most relevant to a question so large databases fit in the prompt.
 * Small schemas are sent whole. Tables linked by foreign keys to a match are included
 * so the model can build joins.
 */
export function relevantTables(question: string, tables: TableDef[], maxTables = 25): TableDef[] {
  if (tables.length <= maxTables) return tables;

  const words = new Set(
    question
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .map(stem),
  );
  const score = (t: TableDef) => {
    let s = 0;
    const tableParts = t.name.toLowerCase().split(/[._]/).map(stem);
    for (const p of tableParts) if (words.has(p)) s += 5;
    for (const c of t.columns) {
      for (const p of c.name.toLowerCase().split("_").map(stem)) if (words.has(p)) s += 1;
    }
    return s;
  };

  const ranked = tables.map((t) => ({ t, s: score(t) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const chosen = new Map<string, TableDef>();
  for (const { t } of ranked.slice(0, maxTables)) chosen.set(t.name.toLowerCase(), t);

  // Add direct foreign-key neighbours of the matches.
  const byName = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  for (const t of [...chosen.values()]) {
    for (const c of t.columns) {
      const target = c.references && byName.get(c.references.table.toLowerCase());
      if (target && chosen.size < maxTables) chosen.set(target.name.toLowerCase(), target);
    }
  }
  for (const t of tables) {
    if (chosen.size >= maxTables) break;
    if (t.columns.some((c) => c.references && chosen.has(c.references.table.toLowerCase()))) {
      chosen.set(t.name.toLowerCase(), t);
    }
  }
  return chosen.size ? [...chosen.values()] : tables.slice(0, maxTables);
}
