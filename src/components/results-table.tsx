"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compareCells, downloadFile, fileNameFor, formatCell, toCsv } from "@/lib/client/format";
import { useAppState } from "@/lib/client/store";
import type { AskResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  result: AskResponse;
  question: string;
}

type Sort = { index: number; dir: "asc" | "desc" } | null;

export function ResultsTable({ result, question }: Props) {
  const settings = useAppState((s) => s.settings);
  const fmt = useMemo(() => ({ locale: settings.locale, currency: settings.currency }), [settings.locale, settings.currency]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(0);
  const pageSize = settings.pageSize;
  const { columns } = result;

  // Pre-format once so search matches what the user sees (e.g. "₹90,000").
  const formatted = useMemo(
    () => result.rows.map((row) => row.map((v, i) => formatCell(v, columns[i], fmt))),
    [result.rows, columns, fmt],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let idx = result.rows.map((_, i) => i);
    if (q) idx = idx.filter((i) => formatted[i].some((cell, c) => cell.toLowerCase().includes(q) || String(result.rows[i][c] ?? "").toLowerCase().includes(q)));
    if (sort) {
      const col = columns[sort.index];
      idx.sort((a, b) => {
        const r = compareCells(result.rows[a][sort.index], result.rows[b][sort.index], col);
        return sort.dir === "asc" ? r : -r;
      });
    }
    return idx;
  }, [search, sort, result.rows, formatted, columns]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const pageRows = visible.slice(current * pageSize, current * pageSize + pageSize);

  function toggleSort(index: number) {
    setPage(0);
    setSort((s) => {
      if (!s || s.index !== index) return { index, dir: columns[index].kind === "number" ? "desc" : "asc" };
      if ((s.dir === "desc") === (columns[index].kind === "number")) return { index, dir: s.dir === "asc" ? "desc" : "asc" };
      return null;
    });
  }

  function exportCsv() {
    const rows = visible.map((i) => result.rows[i]);
    downloadFile(fileNameFor(question), toCsv(columns, rows));
    toast.success(`Exported ${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"} to CSV`);
  }

  const singleValue = result.rowCount === 1 && columns.length === 1;

  return (
    <div className="flex flex-col gap-4">
      {singleValue ? (
        <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-card via-card to-primary/5 p-8 shadow-lg backdrop-blur-md">
          <div className="absolute right-6 top-6 size-24 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{columns[0].label}</p>
          <p
            className={cn(
              "mt-2 text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground",
              columns[0].kind === "number" && "tabular-nums font-mono",
            )}
          >
            {formatted[0][0]}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Computed directly from database records</p>
        </div>
      ) : (
        <>
          {/* Action & Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter results…"
                aria-label="Filter results"
                className="h-9 pr-8 pl-9 rounded-xl border-border/80 bg-card/80 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
                  aria-label="Clear filter"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground tabular-nums font-mono" aria-live="polite">
                {search ? (
                  <>
                    <span className="font-semibold text-foreground">{visible.length}</span> of {result.rowCount} rows
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">{result.rowCount}</span> rows total
                  </>
                )}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={visible.length === 0}
                className="gap-1.5 rounded-xl text-xs h-8 shadow-xs hover:border-primary/40"
              >
                <Download className="size-3.5" aria-hidden /> Export CSV
              </Button>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-lg shadow-black/5 backdrop-blur-md">
            <div className="max-h-[62vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 border-b border-border/80 bg-muted/70 backdrop-blur-md">
                  <tr>
                    {columns.map((c, i) => {
                      const active = sort?.index === i;
                      const SortIcon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                      return (
                        <th
                          key={i}
                          scope="col"
                          aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                          className={cn("px-0 py-0 font-medium whitespace-nowrap text-xs", c.kind === "number" ? "text-right" : "text-left")}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(i)}
                            className={cn(
                              "inline-flex w-full items-center gap-1.5 px-4 py-3 font-semibold uppercase tracking-wider text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:bg-accent",
                              c.kind === "number" && "flex-row-reverse",
                              active && "text-primary font-bold",
                            )}
                          >
                            <span>{c.label}</span>
                            <SortIcon className={cn("size-3 shrink-0", !active && "opacity-35")} aria-hidden />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {pageRows.map((ri) => (
                    <tr key={ri} className="transition-colors hover:bg-primary/[0.03]">
                      {columns.map((c, ci) => {
                        const text = formatted[ri][ci];
                        return (
                          <td
                            key={ci}
                            className={cn(
                              "max-w-[28rem] px-4 py-3 align-middle text-xs",
                              c.kind === "number" ? "text-right tabular-nums whitespace-nowrap font-mono font-medium text-foreground" : "truncate text-foreground/90",
                              text === "—" && "text-muted-foreground font-normal",
                            )}
                            title={text.length > 40 ? text : undefined}
                          >
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={columns.length} className="px-4 py-12 text-center text-xs text-muted-foreground">
                        No rows match “{search}”.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <nav className="flex items-center justify-between gap-2 text-xs pt-1" aria-label="Pagination">
              <p className="text-muted-foreground font-mono">
                Page <span className="font-semibold text-foreground">{current + 1}</span> of {pageCount}
              </p>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current - 1)}
                  disabled={current === 0}
                  className="rounded-xl h-8 px-2.5"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-3.5" aria-hidden /> <span className="hidden sm:inline">Prev</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(current + 1)}
                  disabled={current >= pageCount - 1}
                  className="rounded-xl h-8 px-2.5"
                  aria-label="Next page"
                >
                  <span className="hidden sm:inline">Next</span> <ChevronRight className="size-3.5" aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
