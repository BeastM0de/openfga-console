import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from "react";
import { OpenFgaClient } from "@openfga/sdk";
import { createOpenFgaClient, DEFAULT_API_URL } from "./fga";
import type { ConnectionSettings } from "./types";

const STORAGE_KEY = "openfga-console.connection.v1";

const defaultSettings: ConnectionSettings = {
  apiUrl: DEFAULT_API_URL,
  storeId: "",
  storeName: "",
  modelId: "",
  authMode: "none",
  apiToken: "",
  apiTokenIssuer: "",
  apiAudience: "",
  clientId: "",
  clientSecret: "",
};

interface PersistedSettings {
  apiUrl?: string;
  storeId?: string;
  storeName?: string;
  modelId?: string;
}

interface ConnectionContextValue {
  settings: ConnectionSettings;
  client: OpenFgaClient;
  updateSettings: (next: ConnectionSettings) => void;
  patchSettings: (patch: Partial<ConnectionSettings>) => void;
  clearSecrets: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

function readSavedSettings(): ConnectionSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultSettings;
    const parsed = JSON.parse(saved) as PersistedSettings;
    return {
      ...defaultSettings,
      apiUrl: parsed.apiUrl || DEFAULT_API_URL,
      storeId: parsed.storeId || "",
      storeName: parsed.storeName || "",
      modelId: parsed.modelId || "",
    };
  } catch {
    return defaultSettings;
  }
}

function persistSettings(settings: ConnectionSettings) {
  const safeSettings: PersistedSettings = {
    apiUrl: settings.apiUrl,
    storeId: settings.storeId,
    storeName: settings.storeName,
    modelId: settings.modelId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeSettings));
}

export function ConnectionProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<ConnectionSettings>(readSavedSettings);

  const client = useMemo(() => createOpenFgaClient(settings), [
    settings.apiUrl,
    settings.storeId,
    settings.modelId,
    settings.authMode,
    settings.apiToken,
    settings.apiTokenIssuer,
    settings.apiAudience,
    settings.clientId,
    settings.clientSecret,
  ]);

  const updateSettings = useCallback((next: ConnectionSettings) => {
    setSettings(next);
    persistSettings(next);
  }, []);

  const patchSettings = useCallback((patch: Partial<ConnectionSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      persistSettings(next);
      return next;
    });
  }, []);

  const clearSecrets = useCallback(() => {
    setSettings((current) => ({
      ...current,
      authMode: "none",
      apiToken: "",
      apiTokenIssuer: "",
      apiAudience: "",
      clientId: "",
      clientSecret: "",
    }));
  }, []);

  const value = useMemo(
    () => ({ settings, client, updateSettings, patchSettings, clearSecrets }),
    [settings, client, updateSettings, patchSettings, clearSecrets],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  const value = useContext(ConnectionContext);
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider");
  return value;
}
