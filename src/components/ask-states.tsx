"use client";

import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  FlaskConical,
  Inbox,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Unplug,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Interpreting natural language question", icon: Sparkles },
  { label: "Validating tables & column constraints", icon: Database },
  { label: "Verifying read-only safety policy", icon: ShieldAlert },
  { label: "Executing query & streaming records", icon: Clock },
];

export function LoadingState() {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setCurrentStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 1200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-card/70 p-6 shadow-md backdrop-blur-md" role="status" aria-live="polite">
      {/* Dynamic Step Progress Tracker */}
      <div className="grid gap-3 sm:grid-cols-4">
        {STEPS.map((step, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep;
          const StepIcon = step.icon;

          return (
            <div
              key={step.label}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2.5 text-xs transition-all duration-300",
                isCurrent && "border-primary/50 bg-primary/10 text-primary font-medium shadow-xs shadow-primary/10",
                isDone && "border-emerald-500/30 bg-emerald-500/5 text-emerald-500",
                !isDone && !isCurrent && "border-border/40 text-muted-foreground/60 opacity-60",
              )}
            >
              {isDone ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              ) : isCurrent ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <StepIcon className="size-4 shrink-0" />
              )}
              <span className="line-clamp-2 leading-tight">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Shimmering Table Skeleton */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
        <div className="flex items-center gap-6 border-b border-border/60 bg-muted/40 px-4 py-3">
          {[30, 22, 26, 18].map((w, i) => (
            <div key={i} className="h-4 rounded-md bg-muted-foreground/15 shimmer-active" style={{ width: `${w}%` }} />
          ))}
        </div>
        <div className="divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, r) => (
            <div key={r} className="flex items-center gap-6 px-4 py-3.5">
              {[30, 22, 26, 18].map((w, i) => (
                <div
                  key={i}
                  className="h-3.5 rounded bg-muted-foreground/10 shimmer-active"
                  style={{ width: `${Math.max(12, w - ((r * 4 + i * 7) % 10))}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function EmptyResult({ question }: { question: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center backdrop-blur-xs">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted/80 text-muted-foreground shadow-xs">
        <Inbox className="size-6" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-foreground">No matching records found</h3>
      <p className="max-w-md text-sm text-muted-foreground leading-relaxed">
        The question <span className="font-medium text-foreground">“{question}”</span> returned zero rows from the database. Try asking for broader filters or checking a different category.
      </p>
    </div>
  );
}

const ERROR_ICON: Record<string, typeof AlertCircle> = {
  read_only: ShieldAlert,
  rate_limited: Clock,
  timeout: Clock,
  db_unreachable: Unplug,
  network: Unplug,
};

export function ErrorState({
  code,
  message,
  retryAfterSeconds,
  onRetry,
}: {
  code: string;
  message: string;
  retryAfterSeconds?: number;
  onRetry?: () => void;
}) {
  const Icon = ERROR_ICON[code] ?? AlertCircle;
  const isPolicy = code === "read_only" || code === "cannot_answer";
  const [wait, setWait] = useState(retryAfterSeconds ?? 0);

  useEffect(() => {
    if (!wait) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-5 shadow-xs backdrop-blur-md sm:flex-row sm:items-start",
        isPolicy
          ? "border-muted-foreground/20 bg-muted/30"
          : "border-destructive/30 bg-destructive/5 text-destructive dark:bg-destructive/10",
      )}
    >
      <div
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          isPolicy ? "bg-muted text-muted-foreground" : "bg-destructive/15 text-destructive",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-semibold text-foreground">{isPolicy ? "Query Policy Notice" : "Query Execution Error"}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
      </div>
      {onRetry && !isPolicy && (
        <Button variant="outline" size="sm" onClick={onRetry} disabled={wait > 0} className="shrink-0 gap-1.5 rounded-xl">
          <RotateCcw className="size-3.5" aria-hidden /> {wait > 0 ? `Retry in ${wait}s` : "Retry Query"}
        </Button>
      )}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm shadow-xs backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
          <FlaskConical className="size-4" aria-hidden />
        </div>
        <div>
          <span className="font-semibold text-foreground">Interactive Demo Mode</span>
          <p className="text-xs text-muted-foreground">
            Using built-in sample data: 7 tables (Employees, Departments, Customers, Loans, Accounts, Transactions).
          </p>
        </div>
      </div>
      <Link
        href="/settings"
        className="shrink-0 text-xs font-semibold text-amber-500 hover:text-amber-400 hover:underline transition-colors"
      >
        Connect your live database →
      </Link>
    </div>
  );
}
