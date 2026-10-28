import type { ResultColumn } from "../types";

export interface FormatOptions {
  locale: string;
  currency: string;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

function nf(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let f = numberFormats.get(key);
  if (!f) {
    f = make();
    numberFormats.set(key, f);
  }
  return f;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MIDNIGHT_UTC = /T00:00:00(\.000)?Z$/;

/** Display string for a cell. Values are shown as returned; only presentation changes. */
export function formatCell(value: unknown, col: ResultColumn, opts: FormatOptions): string {
  if (value === null || value === undefined) return "—";
  switch (col.kind) {
    case "number": {
      const n = toNumber(value);
      if (n === null) return String(value);
      if (col.currency) {
        // Whole amounts read better without ".00" (₹90,000); keep paise/cents when present.
        const digits = Number.isInteger(n) ? 0 : 2;
        return nf(`c:${opts.locale}:${opts.currency}:${digits}`, () =>
          new Intl.NumberFormat(opts.locale, {
            style: "currency",
            currency: opts.currency,
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }),
        ).format(n);
      }
      return nf(`n:${opts.locale}`, () => new Intl.NumberFormat(opts.locale, { maximumFractionDigits: 4 })).format(n);
    }
    case "date": {
      const s = String(value);
      const d = new Date(DATE_ONLY.test(s) ? `${s}T00:00:00Z` : s);
      if (Number.isNaN(d.getTime())) return s;
      const dateOnly = DATE_ONLY.test(s) || MIDNIGHT_UTC.test(s);
      return d.toLocaleString(opts.locale, dateOnly ? { dateStyle: "medium", timeZone: "UTC" } : { dateStyle: "medium", timeStyle: "short" });
    }
    case "boolean":
      return value === true || value === "t" || value === "true" ? "Yes" : "No";
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      return String(value);
  }
}

/** Comparator that sorts by the column's type, with empty values last. */
export function compareCells(a: unknown, b: unknown, col: ResultColumn): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
  if (col.kind === "number") return (toNumber(a) ?? 0) - (toNumber(b) ?? 0);
  if (col.kind === "date") return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with raw (unformatted) values so numbers stay machine-readable. */
export function toCsv(columns: ResultColumn[], rows: unknown[][]): string {
  const lines = [columns.map((c) => csvEscape(c.label)).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return "﻿" + lines.join("\r\n");
}

export function downloadFile(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function fileNameFor(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `${slug || "results"}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
