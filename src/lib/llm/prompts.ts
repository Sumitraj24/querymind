import { DIALECTS } from "../dialects";
import { schemaToPrompt } from "../schema";
import type { Dialect, TableDef } from "../types";
import type { ChatMessage } from "../server/llm-client";

export function generateSqlMessages(question: string, dialect: Dialect, tables: TableDef[]): ChatMessage[] {
  const d = DIALECTS[dialect];
  const system = [
    `You are an expert ${d.label} engineer who translates English questions into a single read-only SQL query.`,
    "",
    "Rules:",
    "- Output exactly one SELECT statement (WITH … SELECT is allowed). Never write INSERT, UPDATE, DELETE, DDL, or multiple statements.",
    "- Use only the tables and columns in the schema below. Never invent tables or columns.",
    `- Write valid ${d.label} syntax. ${d.limitHint}`,
    "- Use explicit JOIN … ON clauses that follow the declared foreign keys.",
    "- Return human-readable columns (names, titles) rather than only ids, and give computed columns short snake_case aliases such as total_amount.",
    "- Combine first and last names into one column aliased as name when the question asks for people.",
    "- For \"top N\" questions, order by the relevant measure and limit to N rows.",
    "- If the question asks to change, delete or add data, or cannot be answered from the schema, set sql to an empty string and set reason.",
    "",
    "Respond with JSON only, no markdown, in this exact shape:",
    '{"sql": "<the SQL query or empty string>", "reason": "<empty, or why the question cannot be answered>"}',
    "",
    "Schema:",
    schemaToPrompt(tables),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: question.trim() },
  ];
}

/** Follow-up turn asking the model to fix a query that failed validation or execution. */
export function repairMessage(problem: string): ChatMessage {
  return {
    role: "user",
    content: `That query could not be used: ${problem}\nReturn a corrected query in the same JSON shape, using only the schema provided.`,
  };
}
