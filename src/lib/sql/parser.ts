import { Parser } from "node-sql-parser";
import { DIALECTS } from "../dialects";
import type { Dialect } from "../types";

/** Loosely-typed AST node. node-sql-parser's own typings don't cover every dialect's output. */
export type AstNode = Record<string, unknown>;

let parser: Parser | null = null;

export function getParser(): Parser {
  parser ??= new Parser();
  return parser;
}

export function parserOptions(dialect: Dialect) {
  return { database: DIALECTS[dialect].parser };
}

export function isNode(v: unknown): v is AstNode {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Depth-first visit of every object node in an AST (including inside arrays). */
export function walk(root: unknown, visit: (node: AstNode, key: string | null) => void): void {
  const stack: { value: unknown; key: string | null }[] = [{ value: root, key: null }];
  const seen = new Set<unknown>();
  while (stack.length) {
    const { value, key } = stack.pop()!;
    if (typeof value !== "object" || value === null || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const v of value) stack.push({ value: v, key });
      continue;
    }
    visit(value as AstNode, key);
    for (const [k, v] of Object.entries(value)) stack.push({ value: v, key: k });
  }
}

/** Make parser error messages short and readable. */
export function cleanParseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const loc = (err as { location?: { start?: { line?: number; column?: number } } })?.location?.start;
  const found = /but "(.*?)" found/.exec(raw)?.[1] ?? /but (end of input) found/.exec(raw)?.[1];
  let msg = "The SQL could not be parsed";
  if (found) msg += ` near ${found === "end of input" ? "the end of the input" : `"${found}"`}`;
  if (loc?.line) msg += ` (line ${loc.line}, column ${loc.column ?? 1})`;
  return `${msg}. The statement may use syntax this dialect's parser does not support.`;
}
