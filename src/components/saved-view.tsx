"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Copy, MoreHorizontal, Pencil, Play, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "@/lib/client/format";
import { actions, useAppState } from "@/lib/client/store";
import { ConfirmDialog } from "./confirm-dialog";
import { EmptyState, PageHeader } from "./page-header";
import { SaveQuestionDialog } from "./save-question-dialog";

export function SavedView() {
  const router = useRouter();
  const hydrated = useAppState((s) => s.hydrated);
  const saved = useAppState((s) => s.saved);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? saved.filter((s) => s.name.toLowerCase().includes(q) || s.question.toLowerCase().includes(q)) : saved;
  }, [saved, search]);

  function run(question: string) {
    actions.setAsk({ question });
    actions.queueQuestion(question);
    router.push("/");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title="Saved questions"
        description="Questions you want to run again. Each run uses the latest data. Stored in this browser."
        actions={
          <SaveQuestionDialog
            question=""
            trigger={
              <Button>
                <Bookmark aria-hidden /> New saved question
              </Button>
            }
          />
        }
      />

      {!hydrated ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : saved.length === 0 ? (
        <EmptyState icon={<Bookmark />} title="No saved questions">
          Ask a question, then choose <span className="font-medium text-foreground">Save</span> next to the answer to keep it here.{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Ask a question
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
              placeholder="Search saved questions…"
              aria-label="Search saved questions"
              className="h-9 pl-9 rounded-xl border-border/80 bg-card/80 text-xs shadow-xs focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-xs text-muted-foreground">No saved questions match “{search}”.</p>
          ) : (
            <ul className="grid gap-3.5 sm:grid-cols-2">
              {filtered.map((q) => (
                <li
                  key={q.id}
                  className="group flex flex-col justify-between gap-3.5 rounded-2xl border border-border/80 bg-card/80 p-4 shadow-xs backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold text-sm text-foreground">{q.name}</h2>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">{q.question}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="rounded-lg size-7 text-muted-foreground" aria-label={`More actions for ${q.name}`} />}>
                        <MoreHorizontal className="size-3.5" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 rounded-xl shadow-lg">
                        <DropdownMenuItem
                          onClick={() => {
                            actions.duplicateSaved(q.id);
                            toast.success("Duplicated");
                          }}
                          className="text-xs"
                        >
                          <Copy className="size-3.5" aria-hidden /> Duplicate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-auto flex items-center gap-1.5 pt-2 border-t border-border/40">
                    <span className="mr-auto text-[11px] text-muted-foreground font-mono">Updated {relativeTime(q.updatedAt)}</span>
                    <SaveQuestionDialog
                      question={q.question}
                      existing={q}
                      trigger={
                        <Button variant="ghost" size="icon-sm" className="rounded-lg size-7 text-muted-foreground hover:text-foreground" aria-label={`Edit ${q.name}`}>
                          <Pencil className="size-3" aria-hidden />
                        </Button>
                      }
                    />
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon-sm" className="rounded-lg size-7 text-muted-foreground hover:text-destructive" aria-label={`Delete ${q.name}`}>
                          <Trash2 className="size-3" aria-hidden />
                        </Button>
                      }
                      title="Delete saved question?"
                      description={`“${q.name}” will be removed from this browser.`}
                      confirmLabel="Delete"
                      onConfirm={() => {
                        actions.deleteSaved(q.id);
                        toast.success("Saved question deleted");
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => run(q.question)}
                      className="gap-1.5 rounded-xl text-xs h-7 hover:border-primary/40 font-medium"
                    >
                      <Play className="size-3 text-primary" aria-hidden /> Run
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
