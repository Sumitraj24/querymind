"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/client/api";
import type { HealthResponse } from "@/lib/types";

interface HealthState {
  health: HealthResponse | null;
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
}

const HealthContext = createContext<HealthState>({
  health: null,
  loading: true,
  failed: false,
  refresh: async () => undefined,
});

export const useHealth = () => useContext(HealthContext);

function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await api.health());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial status fetch on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  return <HealthContext.Provider value={{ health, loading, failed, refresh }}>{children}</HealthContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <HealthProvider>{children}</HealthProvider>
      <Toaster richColors closeButton position="bottom-right" />
    </TooltipProvider>
  );
}
