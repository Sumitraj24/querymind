"use client";

import { Database, FlaskConical, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useHealth } from "./providers";

type Tone = "ok" | "warn" | "error" | "pending";

const DOT_COLOR: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-rose-500",
  pending: "bg-primary/60",
};

function Pill({ tone, icon, label, tip }: { tone: Tone; icon: React.ReactNode; label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="group inline-flex h-7 cursor-default items-center gap-2 rounded-full border border-border/70 bg-card/70 px-2.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur-md transition-all duration-200 outline-none hover:border-primary/40 hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        }
      >
        <span className="relative flex size-2 items-center justify-center">
          {tone === "ok" && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          {tone === "pending" && (
            <span className="absolute inline-flex size-full animate-pulse rounded-full bg-primary/40" />
          )}
          <span className={cn("relative inline-flex size-1.5 rounded-full shadow-xs", DOT_COLOR[tone])} aria-hidden />
        </span>
        <span className="text-muted-foreground transition-colors group-hover:text-foreground">{icon}</span>
        <span className="font-medium text-foreground/90">{label}</span>
      </TooltipTrigger>
      <TooltipContent className="text-xs font-normal shadow-lg">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function ModelStatus() {
  const { health, loading, failed } = useHealth();
  const icon = <Sparkles className="size-3 text-indigo-400" aria-hidden />;
  if (loading && !health) return <Pill tone="pending" icon={icon} label="AI" tip="Checking the AI model…" />;
  if (failed || !health) return <Pill tone="error" icon={icon} label="AI offline" tip="Couldn't check the AI model status." />;
  const { llm } = health;
  if (!llm.configured) return <Pill tone="error" icon={icon} label="AI not set up" tip={llm.message} />;
  if (llm.reachable === false) return <Pill tone="warn" icon={icon} label="AI unreachable" tip={llm.message} />;
  return <Pill tone="ok" icon={icon} label="AI Ready" tip={`Connected via FreeLLMAPI · Model: ${llm.defaultModel ?? "auto"}`} />;
}

export function DataStatus() {
  const { health, loading, failed } = useHealth();
  const icon = <Database className="size-3 text-cyan-400" aria-hidden />;
  if (loading && !health) return <Pill tone="pending" icon={icon} label="Data" tip="Checking the database…" />;
  if (failed || !health) return <Pill tone="error" icon={icon} label="Data offline" tip="Couldn't check the database status." />;
  const { database } = health;
  if (database.mode === "demo") {
    return (
      <Pill
        tone="warn"
        icon={<FlaskConical className="size-3 text-amber-400" aria-hidden />}
        label="Demo Data"
        tip="Running on embedded sample dataset (7 tables). Connect live DB in Settings."
      />
    );
  }
  if (!database.connected) {
    return <Pill tone="error" icon={icon} label="Database offline" tip={database.message} />;
  }
  return (
    <Pill
      tone="ok"
      icon={icon}
      label="Live Database"
      tip={`Connected · ${database.tableCount ?? 0} tables available`}
    />
  );
}
