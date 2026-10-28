"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme, type Theme } from "@/lib/client/theme";
import { Bookmark, History, Menu, MessageSquareText, Monitor, Moon, Settings, Sparkles, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAppState } from "@/lib/client/store";
import { cn } from "@/lib/utils";
import { DataStatus, ModelStatus } from "./status-badges";

const NAV = [
  { href: "/", label: "Ask AI", icon: MessageSquareText },
  { href: "/history", label: "History", icon: History },
  { href: "/saved", label: "Saved questions", icon: Bookmark },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("group flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span
        className="relative grid size-8 place-items-center rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 text-white shadow-md shadow-indigo-500/20 ring-1 ring-white/25 transition-transform duration-200 group-hover:scale-105"
        aria-hidden
      >
        <Sparkles className="size-4 transition-transform duration-300 group-hover:rotate-12" />
      </span>
      <span className="text-base font-bold tracking-tight">
        QueryMind
      </span>
      <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-primary">
        AI
      </span>
    </span>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const historyCount = useAppState((s) => s.history.length);
  const savedCount = useAppState((s) => s.saved.length);
  const counts: Record<string, number> = { "/history": historyCount, "/saved": savedCount };

  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "border border-border/80 bg-sidebar-accent text-foreground shadow-xs"
                : "text-sidebar-foreground/70 hover:translate-x-0.5 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            {active && (
              <span className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-primary" aria-hidden />
            )}
            <Icon
              className={cn(
                "size-4 shrink-0 transition-colors",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
              aria-hidden
            />
            <span className="flex-1">{label}</span>
            {counts[href] ? (
              <span className="rounded-full border border-border/50 bg-background/60 px-1.5 py-0.2 text-[11px] font-mono tabular-nums text-muted-foreground">
                {counts[href]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-sidebar-accent/30 p-2.5 shadow-xs backdrop-blur-xs">
      <span
        className="grid size-8 place-items-center rounded-lg bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 text-xs font-semibold text-primary border border-primary/20"
        aria-hidden
      >
        SQL
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-medium text-foreground">Natural Query</p>
        <p className="truncate text-muted-foreground">Read-only sandbox</p>
      </div>
    </div>
  );
}

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Change theme" className="size-8 rounded-lg" />}>
        <Sun className="size-4 transition-all dark:hidden" aria-hidden />
        <Moon className="hidden size-4 transition-all dark:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36 rounded-xl shadow-lg">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">Appearance</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
            <DropdownMenuRadioItem value="light">
              <Sun aria-hidden className="size-4" /> Light
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon aria-hidden className="size-4" /> Dark
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor aria-hidden className="size-4" /> System
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative flex min-h-dvh">
      {/* Ambient background glow for high-end depth */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[350px] left-1/2 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-b from-indigo-500/12 via-purple-500/5 to-transparent blur-3xl dark:from-indigo-500/8 dark:via-purple-500/4" />
      </div>

      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-3 focus:ring-ring/50"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-border/60 bg-sidebar/80 p-4 backdrop-blur-md md:flex">
        <Link href="/" className="rounded-xl px-1 pt-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <NavLinks />
        <div className="mt-auto">
          <SidebarFooter />
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-6 bg-sidebar/95 p-4 backdrop-blur-lg">
          <SheetTitle className="px-1 pt-1">
            <Logo />
          </SheetTitle>
          <NavLinks onNavigate={() => setMobileOpen(false)} />
          <div className="mt-auto">
            <SidebarFooter />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b border-border/50 bg-background/70 px-4 backdrop-blur-xl supports-backdrop-filter:bg-background/60 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden size-8" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="size-5" aria-hidden />
          </Button>
          <Link href="/" className="md:hidden">
            <Logo className="text-sm" />
          </Link>
          <div className="hidden items-center gap-2 lg:flex text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">QueryMind Studio</span>
            <span className="text-muted-foreground/40">•</span>
            <span>Natural language data engine</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <DataStatus />
              <ModelStatus />
            </div>
            <div className="h-4 w-px bg-border/60 hidden sm:block" />
            <ThemeMenu />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Settings"
              className="size-8 rounded-lg"
              nativeButton={false}
              render={<Link href="/settings" />}
            >
              <Settings className="size-4" aria-hidden />
            </Button>
          </div>
        </header>
        <main id="main" className="flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
