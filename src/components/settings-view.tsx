"use client";

import { CheckCircle2, Database, FlaskConical, Loader2, RefreshCw, ShieldCheck, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/client/api";
import { formatCell } from "@/lib/client/format";
import { actions, useAppState } from "@/lib/client/store";
import { useTheme, type Theme } from "@/lib/client/theme";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";
import { NativeSelect } from "./native-select";
import { PageHeader } from "./page-header";
import { useHealth } from "./providers";

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card/80 shadow-xs backdrop-blur-md overflow-hidden transition-all duration-200 hover:border-border">
      <header className="flex items-start gap-3.5 border-b border-border/60 bg-muted/20 px-6 py-4">
        <span className="mt-0.5 text-primary [&_svg]:size-4">{icon}</span>
        <div>
          <h2 className="text-sm font-semibold text-foreground tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </header>
      <div className="flex flex-col gap-6 px-6 py-5">{children}</div>
    </section>
  );
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[14rem_1fr] sm:items-center sm:gap-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function StatusLine({ tone, children }: { tone: "ok" | "warn" | "error"; children: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : TriangleAlert;
  return (
    <p className={cn("flex items-start gap-2 text-sm", tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "text-destructive")}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="text-foreground">{children}</span>
    </p>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]">{children}</code>;
}

const CURRENCIES = [
  ["INR", "Indian rupee (₹)"],
  ["USD", "US dollar ($)"],
  ["EUR", "Euro (€)"],
  ["GBP", "British pound (£)"],
  ["JPY", "Japanese yen (¥)"],
  ["AUD", "Australian dollar (A$)"],
  ["CAD", "Canadian dollar (C$)"],
  ["SGD", "Singapore dollar (S$)"],
  ["AED", "UAE dirham (AED)"],
] as const;

const LOCALES = [
  ["en-IN", "India (1,00,000.00)"],
  ["en-US", "United States (100,000.00)"],
  ["en-GB", "United Kingdom (100,000.00)"],
  ["de-DE", "Germany (100.000,00)"],
  ["fr-FR", "France (100 000,00)"],
] as const;

function ModelPicker() {
  const { health } = useHealth();
  const model = useAppState((s) => s.settings.model);
  const [models, setModels] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reachable = health?.llm.reachable === true;

  useEffect(() => {
    if (!reachable) return;
    let cancelled = false;
    api
      .models()
      .then((r) => !cancelled && setModels(r.models))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "Couldn't load models."));
    return () => {
      cancelled = true;
    };
  }, [reachable]);

  if (!reachable) {
    return <p className="text-sm text-muted-foreground">Model choice becomes available once the AI provider is reachable.</p>;
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!models) return <Skeleton className="h-9 w-full" />;
  const options = model && !models.includes(model) ? [model, ...models] : models;
  return (
    <NativeSelect id="model" value={model} onChange={(e) => actions.updateSettings({ model: e.target.value })}>
      <option value="">Server default ({health?.llm.defaultModel ?? "auto"})</option>
      {options.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </NativeSelect>
  );
}

function DatabaseTest() {
  const { refresh } = useHealth();
  const [state, setState] = useState<"idle" | "testing">("idle");
  const [result, setResult] = useState<{ ok: boolean; text: string; warnings: string[] } | null>(null);

  async function test() {
    setState("testing");
    try {
      const r = await api.testDatabase();
      setResult({
        ok: true,
        text: `${r.mode === "demo" ? "Demo database" : "Database"} responded in ${r.latencyMs} ms with ${r.tableCount} tables available.`,
        warnings: r.warnings,
      });
      toast.success("Connection works");
      void refresh();
    } catch (e) {
      setResult({ ok: false, text: e instanceof ApiError ? e.message : "The connection test failed.", warnings: [] });
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" onClick={test} disabled={state === "testing"} className="w-fit">
        {state === "testing" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Test connection
      </Button>
      {result && (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <StatusLine tone={result.ok ? "ok" : "error"}>{result.text}</StatusLine>
          {result.warnings.map((w) => (
            <StatusLine key={w} tone="warn">
              {w}
            </StatusLine>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsView() {
  const { health, loading } = useHealth();
  const settings = useAppState((s) => s.settings);
  const historyCount = useAppState((s) => s.history.length);
  const { theme, setTheme } = useTheme();

  const sample = formatCell(90000, { name: "salary", label: "Salary", kind: "number", currency: true }, settings);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title="Settings" description="Connection status and display preferences. Preferences are saved in this browser." />

      <Section icon={<Sparkles />} title="AI model" description="QueryMind uses your FreeLLMAPI server to understand questions.">
        {loading && !health ? (
          <Skeleton className="h-5 w-2/3" />
        ) : !health?.llm.configured ? (
          <div className="flex flex-col gap-2 text-sm">
            <StatusLine tone="error">The AI model isn’t set up yet.</StatusLine>
            <p className="text-muted-foreground">
              Add <Code>FREELLMAPI_BASE_URL</Code>, <Code>FREELLMAPI_API_KEY</Code> and optionally <Code>FREELLMAPI_MODEL</Code> to the server’s{" "}
              <Code>.env.local</Code> file (or your host’s environment settings), then restart. Keys stay on the server and are never sent to the browser.
            </p>
          </div>
        ) : health.llm.reachable ? (
          <StatusLine tone="ok">Connected to FreeLLMAPI.</StatusLine>
        ) : (
          <StatusLine tone="warn">{health.llm.message}</StatusLine>
        )}
        <Field id="model" label="Model" hint="“auto” lets FreeLLMAPI choose and fall back between providers.">
          <ModelPicker />
        </Field>
      </Section>

      <Section icon={<Database />} title="Database" description="Where answers come from. Credentials are configured on the server only.">
        {loading && !health ? (
          <Skeleton className="h-5 w-2/3" />
        ) : health?.database.mode === "demo" ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-start gap-2">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                <span className="font-medium">Demo mode.</span> No database is connected, so answers come from built-in fictional sample data.
              </span>
            </p>
            <p className="text-muted-foreground">
              To use your own data, set <Code>DATABASE_URL</Code> on the server to a PostgreSQL connection string for a{" "}
              <span className="font-medium text-foreground">read-only</span> database user, then restart. See the README for a step-by-step guide.
            </p>
          </div>
        ) : health?.database.connected ? (
          <StatusLine tone="ok">Connected to your PostgreSQL database · {health.database.tableCount ?? 0} tables available.</StatusLine>
        ) : (
          <StatusLine tone="error">{health?.database.message ?? "The database could not be reached."}</StatusLine>
        )}
        <DatabaseTest />
      </Section>

      <Section icon={<ShieldCheck />} title="Results" description="How answers are displayed.">
        <Field id="rowLimit" label="Maximum rows" hint="Larger answers are cut off at this many rows.">
          <NativeSelect id="rowLimit" value={settings.rowLimit} onChange={(e) => actions.updateSettings({ rowLimit: Number(e.target.value) })}>
            {[50, 100, 250, 500, 1000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()} rows
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="pageSize" label="Rows per page">
          <NativeSelect id="pageSize" value={settings.pageSize} onChange={(e) => actions.updateSettings({ pageSize: Number(e.target.value) })}>
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="currency" label="Currency" hint={`Money columns look like ${sample}`}>
          <NativeSelect id="currency" value={settings.currency} onChange={(e) => actions.updateSettings({ currency: e.target.value })}>
            {CURRENCIES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="locale" label="Number format">
          <NativeSelect id="locale" value={settings.locale} onChange={(e) => actions.updateSettings({ locale: e.target.value })}>
            {LOCALES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="theme" label="Theme">
          <NativeSelect id="theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </NativeSelect>
        </Field>
      </Section>

      <Section icon={<Trash2 />} title="History & privacy" description="Your questions are stored only in this browser.">
        <Field id="saveHistory" label="Keep question history" hint="Turn off to stop recording new questions.">
          <Switch id="saveHistory" checked={settings.saveHistory} onCheckedChange={(v) => actions.updateSettings({ saveHistory: v })} />
        </Field>
        <Field id="clear" label="Clear history" hint={`${historyCount} question${historyCount === 1 ? "" : "s"} stored`}>
          <ConfirmDialog
            trigger={
              <Button id="clear" variant="outline" className="w-fit" disabled={historyCount === 0}>
                <Trash2 aria-hidden /> Clear history
              </Button>
            }
            title="Clear all history?"
            description="This removes every question from this browser's history. Saved questions are kept."
            confirmLabel="Clear history"
            onConfirm={() => {
              actions.clearHistory();
              toast.success("History cleared");
            }}
          />
        </Field>
        <Field id="reset" label="Reset preferences">
          <Button
            id="reset"
            variant="ghost"
            className="w-fit"
            onClick={() => {
              actions.resetSettings();
              toast.success("Preferences reset");
            }}
          >
            Reset to defaults
          </Button>
        </Field>
      </Section>

      <section className="rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">About QueryMind AI {health ? `v${health.version}` : ""}</p>
        <p className="mt-1">
          Questions are turned into database queries on the server. Every query is checked by a SQL parser and only read-only lookups
          are allowed, then run inside a read-only transaction with a time limit and row limit. These checks greatly reduce risk but
          can’t guarantee complete security, so always connect with a read-only database account.
        </p>
      </section>
    </div>
  );
}
