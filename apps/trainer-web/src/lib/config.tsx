import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ConfigResponse } from "@fitbud/contracts";
import { apiClient } from "./api";

type ConfigContextValue = {
  config: ConfigResponse | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await apiClient.getConfig(true);
      setConfig(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void apiClient.getConfig().then(setConfig).catch((cause) => {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    }).finally(() => setLoading(false));

    const onFocus = () => {
      void apiClient.getConfig().then(setConfig).catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const value = useMemo(
    () => ({ config, loading, error, refresh }),
    [config, loading, error, refresh],
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within ConfigProvider");
  }
  return ctx;
}

export function isWhatsAppOtpEnabled(config: ConfigResponse | null): boolean {
  return config?.flags.wa_otp === true;
}

export function isWhatsAppAutomationEnabled(config: ConfigResponse | null): boolean {
  return config?.flags.wa_automation === true;
}

export function isStepsEnabled(config: ConfigResponse | null): boolean {
  return config?.flags.steps_enabled === true;
}
