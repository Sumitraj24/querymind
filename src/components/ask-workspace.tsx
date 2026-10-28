"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Building,
  Check,
  Copy,
  CreditCard,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/client/api";
import { actions, getState, useAppState } from "@/lib/client/store";
import { DemoBanner, EmptyResult, ErrorState, LoadingState } from "./ask-states";
import { useHealth } from "./providers";
import { ResultsTable } from "./results-table";
import { SaveQuestionDialog } from "./save-question-dialog";

const MAX_LENGTH = 1000;

const CURATED_PROMPTS = [
  {
    category: "Salaries",
    icon: Users,
    question: "Show the top 5 employees with the highest salaries.",
  },
  {
    category: "Departments",
    icon: Building,
    question: "What is the average salary by department?",
  },
  {
    category: "Accounts",
    icon: CreditCard,
    question: "Find customers with a balance greater than 5000.",
  },
  {
    category: "Performance",
    icon: TrendingUp,
    question: "Show monthly transaction totals.",
  },
  {
    category: "Customers",
    icon: Users,
    question: "Count customers by city.",
  },
  {
    category: "Loans",
    icon: CreditCard,
    question: "Find customers who have never taken a loan.",
  },
];

export function AskWorkspace() {
  const ask = useAppState((s) => s.ask);
  const hydrated = useAppState((s) => s.hydrated);
  const { health } = useHealth();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const modeRef = useRef<"live" | "demo">("live");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (health) modeRef.current = health.database.mode;
  }, [health]);

  const run = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (question.length < 3) {
      inputRef.current?.focus();
      return;
    }
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    actions.setAsk({ question, status: "loading", error: null, askedQuestion: question });

    const { settings } = getState();
    try {
      const result = await api.ask(question, { model: settings.model, rowLimit: settings.rowLimit }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      actions.setAsk({ status: "success", result });
      actions.addHistory({
        question,
        status: result.rowCount === 0 ? "empty" : "answered",
        mode: result.mode,
        rowCount: result.rowCount,
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const e = err instanceof ApiError ? err : new ApiError("unknown", "Something went wrong. Please try again.", 0);
      actions.setAsk({ status: "error", result: null, error: { code: e.code, message: e.message, retryAfterSeconds: e.retryAfterSeconds } });
      actions.addHistory({ question, status: "failed", mode: modeRef.current, rowCount: null, error: e.message });
      if (e.code === "rate_limited") toast.warning("Slow down a little", { description: e.message });
    }
  }, []);

  // Run a question queued from History or Saved questions.
  useEffect(() => {
    if (!hydrated) return;
    const pending = actions.takePendingQuestion();
    if (pending) void run(pending);
  }, [hydrated, run]);

  useEffect(() => () => controller.current?.abort(), []);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void run(ask.question);
    }
  }

  function askExample(q: string) {
    actions.setAsk({ question: q });
    void run(q);
  }

  function copyQuestionText() {
    if (!ask.askedQuestion) return;
    void navigator.clipboard.writeText(ask.askedQuestion);
    setCopied(true);
    toast.success("Question copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  }

  const loading = ask.status === "loading";
  const isDemo = health?.database.mode === "demo";
  const result = ask.result;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <section className="flex flex-col gap-6">
        {/* Hero Header */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary shadow-xs backdrop-blur-xs">
            <Sparkles className="size-3.5 text-indigo-400" />
            <span>QueryMind AI Engine</span>
            <span className="text-primary/40">•</span>
            <span className="text-foreground/80">Plain English into SQL</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl lg:text-5xl">
            Ask your data{" "}
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 bg-clip-text text-transparent">
              anything.
            </span>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground text-pretty sm:text-base leading-relaxed">
            QueryMind writes safe read-only SQL behind the scenes, executes it against your data engine, and streams back interactive tables.
          </p>
        </div>

        {isDemo && <DemoBanner />}

        {/* Studio Prompt Box */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(ask.question);
          }}
          className="group relative rounded-2xl border border-border/80 bg-card/90 shadow-xl shadow-primary/5 backdrop-blur-xl transition-all duration-300 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10 hover:border-border"
        >
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <Textarea
            id="question"
            ref={inputRef}
            value={ask.question}
            onChange={(e) => actions.setAsk({ question: e.target.value })}
            onKeyDown={onKeyDown}
            placeholder="Ask anything, e.g. 'Show the top 5 employees with the highest salaries' or 'How many accounts per customer?'"
            maxLength={MAX_LENGTH}
            rows={3}
            autoFocus
            className="min-h-28 resize-none border-0 bg-transparent px-4 pt-4 pb-16 text-base text-foreground shadow-none placeholder:text-muted-foreground/50 focus-visible:ring-0 dark:bg-transparent md:text-base"
          />

          {/* Bottom Toolbar inside Prompt Box */}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden items-center gap-1.5 sm:inline-flex">
                <kbd className="rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                  ↵ Enter
                </kbd>
                <span>to ask</span>
              </span>
              <span className="hidden sm:inline text-muted-foreground/30">•</span>
              <span className="hidden items-center gap-1.5 md:inline-flex">
                <kbd className="rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                  Shift + ↵
                </kbd>
                <span>for newline</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              {ask.question.length > MAX_LENGTH * 0.8 && (
                <span className="text-xs text-muted-foreground tabular-nums font-mono">
                  {ask.question.length}/{MAX_LENGTH}
                </span>
              )}
              <Button
                type="submit"
                size="lg"
                className="pointer-events-auto h-9 gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 px-4 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/40 hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
                disabled={loading || ask.question.trim().length < 3}
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
                <span>{loading ? "Analyzing…" : "Ask AI"}</span>
              </Button>
            </div>
          </div>
        </form>

        {/* Suggestion Chips */}
        {ask.status === "idle" && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="size-3.5 text-amber-500" aria-hidden />
              <span>Suggested Explorations</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {CURATED_PROMPTS.map(({ category, icon: Icon, question: q }) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => askExample(q)}
                  className="group flex flex-col justify-between gap-2 rounded-2xl border border-border/70 bg-card/60 p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card hover:shadow-md hover:shadow-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground group-hover:border-primary/30 group-hover:text-primary transition-colors">
                      <Icon className="size-3" />
                      {category}
                    </span>
                    <ArrowRight className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <p className="text-xs font-medium text-foreground/90 group-hover:text-foreground line-clamp-2 leading-relaxed">
                    {q}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Answer View */}
      {ask.status !== "idle" && (
        <section aria-labelledby="answer-heading" className="flex flex-col gap-5 pt-2">
          {/* Answer Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-xs backdrop-blur-md">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-semibold uppercase tracking-wider text-primary">Generated Result</span>
                <span>•</span>
                <span>Plain English Query</span>
              </div>
              <h2 id="answer-heading" className="text-lg font-semibold tracking-tight text-foreground text-pretty">
                “{ask.askedQuestion}”
              </h2>
            </div>

            {ask.status === "success" && result && (
              <div className="flex flex-wrap items-center gap-2">
                {result.mode === "demo" ? (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500 font-medium">
                    Demo Dataset
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 font-medium">
                    Live Database
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-xs font-mono text-muted-foreground">
                  <Timer className="size-3 text-primary" aria-hidden /> {(result.durationMs / 1000).toFixed(2)}s
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyQuestionText}
                  className="gap-1.5 rounded-xl text-xs h-8"
                  aria-label="Copy question"
                >
                  {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
                </Button>
                <SaveQuestionDialog
                  question={ask.askedQuestion ?? ""}
                  trigger={
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-xl text-xs h-8">
                      <Bookmark className="size-3.5" aria-hidden /> Save
                    </Button>
                  }
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 rounded-xl text-xs h-8 font-medium"
                  onClick={() => {
                    actions.resetAsk();
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                >
                  <Plus className="size-3.5" aria-hidden /> New Query
                </Button>
              </div>
            )}
          </div>

          {loading && <LoadingState />}

          {ask.status === "error" && ask.error && (
            <>
              <ErrorState
                key={ask.askedQuestion ?? ""}
                code={ask.error.code}
                message={ask.error.message}
                retryAfterSeconds={ask.error.retryAfterSeconds}
                onRetry={() => void run(ask.askedQuestion ?? ask.question)}
              />
              {ask.error.code === "not_configured" && (
                <p className="text-sm text-muted-foreground">
                  See{" "}
                  <Link href="/settings" className="font-medium text-foreground underline underline-offset-4">
                    Settings
                  </Link>{" "}
                  for setup steps.
                </p>
              )}
            </>
          )}

          {ask.status === "success" && result && (
            <>
              {result.notices.map((n) => (
                <p key={n} className="rounded-xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
                  {n}
                </p>
              ))}
              {result.rowCount === 0 ? (
                <EmptyResult question={ask.askedQuestion ?? ""} />
              ) : (
                <ResultsTable key={`${ask.askedQuestion}-${result.durationMs}`} result={result} question={ask.askedQuestion ?? ""} />
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
