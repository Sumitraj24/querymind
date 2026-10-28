"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, CircleDashed, History, Play, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/client/format";
import { actions, useAppState } from "@/lib/client/store";
import type { HistoryEntry } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState, PageHeader } from "./page-header";

const STATUS = {
  answered: { icon: CheckCircle2, label: "Answered", className: "text-success" },
  empty: { icon: CircleDashed, label: "No matches", className: "text-muted-foreground" },
  failed: { icon: AlertCircle, label: "Failed", className: "text-destructive" },
} as const;

function describe(h: HistoryEntry): string {
  if (h.status === "failed") return h.error ?? "Failed";
  if (h.status === "empty") return "No matching records";
  return `${(h.rowCount ?? 0).toLocaleString()} row${h.rowCount === 1 ? "" : "s"}`;
}

export function HistoryView() {
  const router = useRouter();
  const hydrated = useAppState((s) => s.hydrated);
  const history = useAppState((s) => s.history);
  const saveHistory = useAppState((s) => s.settings.saveHistory);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? history.filter((h) => h.question.toLowerCase().includes(q)) : history;
  }, [history, search]);

  function rerun(question: string) {
    actions.setAsk({ question });
    actions.queueQuestion(question);
    router.push("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="History"
        description="Questions you asked recently. Stored only in this browser."
        actions={
          history.length > 0 && (
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  <Trash2 aria-hidden /> Clear all
                </Button>
              }
              title="Clear all history?"
              description={`This removes all ${history.length} questions from this browser. Saved questions are kept.`}
              confirmLabel="Clear history"
              onConfirm={() => {
                actions.clearHistory();
                toast.success("History cleared");
              }}
            />
          )
        }
      />

      {!saveHistory && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          History recording is turned off. Turn it on in <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">Settings</Link>.
        </p>
      )}

      {!hydrated ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <EmptyState icon={<History />} title="No questions yet">
          Questions you ask will show up here so you can run them again.{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Ask your first question
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          <div className="relative sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history…"
              aria-label="Search history"
              className="h-9 pl-9 rounded-xl border-border/80 bg-card/80 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">No questions match “{search}”.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {filtered.map((h) => {
                const s = STATUS[h.status];
                return (
                  <li
                    key={h.id}
                    className="group flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card/80 p-3.5 shadow-xs backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                  >
                    <div className="grid size-8 place-items-center rounded-xl bg-muted/60 shrink-0">
                      <s.icon className={`size-4 ${s.className}`} aria-label={s.label} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{h.question}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-0.5 font-mono">
                        <time dateTime={h.createdAt} title={new Date(h.createdAt).toLocaleString()}>
                          {relativeTime(h.createdAt)}
                        </time>
                        <span aria-hidden>·</span>
                        <span className="truncate">{describe(h)}</span>
                        {h.mode === "demo" && (
                          <Badge variant="outline" className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-500">
                            Demo
                          </Badge>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rerun(h.question)}
                      className="gap-1.5 rounded-xl text-xs h-8 hover:border-primary/40"
                    >
                      <Play className="size-3 text-primary" aria-hidden /> Run again
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-lg size-8 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete "${h.question}" from history`}
                      onClick={() => {
                        actions.deleteHistory(h.id);
                        toast.success("Removed from history");
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
