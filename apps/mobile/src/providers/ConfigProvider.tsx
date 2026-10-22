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
import { createConfigClient, loadConfig } from "../lib/config";
import { resolveApiBaseUrl } from "../lib/api";

type ConfigContextValue = {
  config: ConfigResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const client = useMemo(
    () => createConfigClient(resolveApiBaseUrl()),
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const value = await loadConfig(client, true);
      setConfig(value);
    } catch {
      setConfig(null);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ config, loading, refresh }),
    [config, loading, refresh],
  );

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useConfig must be used within ConfigProvider.");
  }
  return ctx;
}
