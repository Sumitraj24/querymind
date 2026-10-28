import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between pb-2 border-b border-border/40">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground text-pretty max-w-xl leading-relaxed">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/40 px-6 py-16 text-center backdrop-blur-xs">
      <span className="grid size-12 place-items-center rounded-2xl bg-muted/80 text-muted-foreground shadow-xs [&_svg]:size-6">
        {icon}
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children && <div className="max-w-sm text-xs text-muted-foreground leading-relaxed">{children}</div>}
    </div>
  );
}
