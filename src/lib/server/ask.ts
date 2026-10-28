import "server-only";
import { generateSqlMessages, repairMessage } from "../llm/prompts";
import { parseGeneration } from "../llm/parse";
import { relevantTables } from "../schema";
import { validateSql } from "../sql/validator";
import type { AskResponse, ColumnKind, ResultColumn } from "../types";
import { DatabaseError, getAdapter, getSchema } from "./db";
import type { RawColumn, RawResult } from "./db/adapter";
import { executionLimits } from "./env";
import { RequestError } from "./http";
import { chatCompletion, type ChatMessage } from "./llm-client";

export const MAX_QUESTION_LENGTH = 1000;

/** Validation codes that mean the model tried to change data: refuse, don't retry. */
const WRITE_CODES = new Set(["write_operation", "nested_write_operation", "select_into", "locking_read"]);
const WRITE_INTENT = /\b(delete|remove|drop|truncate|update|insert|modify|change|alter|create|add|rename|grant|revoke|erase|wipe)\b/i;

const READ_ONLY_MESSAGE = "QueryMind can only look up and summarise data. It can't add, change or delete records.";
const CANNOT_ANSWER_MESSAGE =
  "I couldn't answer that question from the available data. Try rephrasing it or asking about a different topic.";

const debugSql = process.env.QUERYMIND_DEBUG_SQL === "true" && process.env.NODE_ENV !== "production";

export interface AskOptions {
  model?: string;
  rowLimit?: number;
}

export async function answerQuestion(question: string, options: AskOptions = {}): Promise<AskResponse> {
  const started = performance.now();
  const adapter = getAdapter();
  const allTables = await getSchema();
  if (allTables.length === 0) {
    throw new RequestError(409, "empty_database", "The connected database has no tables that QueryMind can read.");
  }

  const tables = relevantTables(question, allTables);
  const limits = executionLimits();
  const rowLimit = Math.min(options.rowLimit ?? limits.maxRowLimit, limits.maxRowLimit);
  const messages: ChatMessage[] = generateSqlMessages(question, adapter.dialect, tables);

  // One initial attempt plus one repair attempt with feedback.
  for (let attempt = 0; attempt < 2; attempt++) {
    const isLast = attempt === 1;
    const completion = await chatCompletion({ messages, model: options.model, temperature: 0 });
    messages.push({ role: "assistant", content: completion.content });

    const parsed = parseGeneration(completion.content);
    if (!parsed) {
      if (isLast) throw new RequestError(502, "invalid_model_output", "The AI model gave an answer QueryMind couldn't use. Please try again.");
      messages.push(repairMessage("the response was not the requested JSON object."));
      continue;
    }
    if (!parsed.sql) {
      throw new RequestError(422, "cannot_answer", WRITE_INTENT.test(question) ? READ_ONLY_MESSAGE : CANNOT_ANSWER_MESSAGE);
    }

    const validation = validateSql(parsed.sql, { dialect: adapter.dialect, tables: allTables });
    if (debugSql) console.debug("[ask] attempt", attempt + 1, "valid:", validation.valid, "\n" + parsed.sql);

    const errors = validation.issues.filter((i) => i.severity === "error");
    if (errors.some((e) => WRITE_CODES.has(e.code))) {
      throw new RequestError(422, "read_only", READ_ONLY_MESSAGE);
    }
    const schemaWarnings = validation.issues.filter((i) => i.code === "unknown_table" || i.code === "unknown_column");
    if (errors.length || (schemaWarnings.length && !isLast)) {
      if (isLast) throw new RequestError(422, "unsafe_query", CANNOT_ANSWER_MESSAGE);
      messages.push(repairMessage([...errors, ...schemaWarnings].map((i) => i.message).join(" ")));
      continue;
    }

    let raw: RawResult;
    try {
      raw = await adapter.execute(parsed.sql, { rowLimit, timeoutMs: limits.statementTimeoutMs });
    } catch (err) {
      if (err instanceof DatabaseError && err.code === "query_error" && !isLast) {
        messages.push(repairMessage(`the database returned this error: ${err.detail ?? "unknown error"}`));
        continue;
      }
      throw err;
    }
    // Report the full time to answer (AI + database), which is what the user waited for.
    return { ...toResponse(raw, adapter.mode), durationMs: Math.round(performance.now() - started) };
  }
  throw new RequestError(422, "cannot_answer", CANNOT_ANSWER_MESSAGE);
}

// ---------------------------------------------------------------------------
// Shaping results for the client. Only column metadata and values leave the server.
// ---------------------------------------------------------------------------
const NUMBER_OIDS = new Set([20, 21, 23, 26, 700, 701, 790, 1700]);
const DATE_OIDS = new Set([1082, 1114, 1184]);
const JSON_OIDS = new Set([114, 3802]);

function kindOf(col: RawColumn, values: unknown[]): ColumnKind {
  const oid = col.dataTypeID;
  if (oid != null) {
    if (NUMBER_OIDS.has(oid)) return "number";
    if (DATE_OIDS.has(oid)) return "date";
    if (oid === 16) return "boolean";
    if (JSON_OIDS.has(oid)) return "json";
    return "text";
  }
  const sample = values.find((v) => v !== null);
  if (typeof sample === "number") return "number";
  if (typeof sample === "boolean") return "boolean";
  if (typeof sample === "object" && sample !== null) return "json";
  return "text";
}

const CURRENCY_NAME = /(salar|balance|amount|price|cost|revenue|principal|income|payment|spend|fee|wage|pay|sales|profit|earning)/i;
// Whole snake_case words only, so "average_salary" isn't caught by "age".
const NOT_CURRENCY = /(^|_)(count|cnt|rate|percent|pct|ratio|id|number|num|qty|quantity|days|age|year|month)(_|$)/i;

export function humanizeColumn(name: string): string {
  const words = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\s]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function toResponse(raw: RawResult, mode: AskResponse["mode"]): AskResponse {
  const columns: ResultColumn[] = raw.columns.map((c, i) => {
    const kind = kindOf(c, raw.rows.map((r) => r[i]));
    return {
      name: c.name,
      label: humanizeColumn(c.name),
      kind,
      currency: kind === "number" && CURRENCY_NAME.test(c.name) && !NOT_CURRENCY.test(c.name),
    };
  });
  const notices: string[] = [];
  if (raw.truncated) notices.push(`Showing the first ${raw.rowLimit.toLocaleString("en-US")} rows. Ask a more specific question to narrow the results.`);
  return {
    mode,
    columns,
    rows: raw.rows,
    rowCount: raw.rows.length,
    truncated: raw.truncated,
    rowLimit: raw.rowLimit,
    durationMs: raw.durationMs,
    notices,
  };
}
