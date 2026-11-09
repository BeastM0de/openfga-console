import { useState, type FormEvent, type PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  GitBranch,
  LayoutDashboard,
  LoaderCircle,
  Plus,
  Settings2,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { useConnection } from "../ConnectionContext";
import type { DashboardView, OpenFgaStore } from "../types";
import { ConnectionDialog } from "./ConnectionDialog";
import { Modal } from "./Modal";

const navigation: Array<{ id: DashboardView; label: string; icon: typeof LayoutDashboard; hint: string }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "Workspace health" },
  { id: "models", label: "Authorization models", icon: GitBranch, hint: "Model editor & history" },
  { id: "tuples", label: "Relationship tuples", icon: Database, hint: "Data explorer" },
  { id: "playground", label: "Playground", icon: FlaskConical, hint: "Check permissions" },
];

interface AppShellProps extends PropsWithChildren {
  activeView: DashboardView;
  onNavigate: (view: DashboardView) => void;
  stores: OpenFgaStore[];
  storesLoading: boolean;
  storesError?: Error | null;
  onRefreshStores: () => void;
}

export function AppShell({
  activeView,
  onNavigate,
  stores,
  storesLoading,
  storesError,
  onRefreshStores,
  children,
}: AppShellProps) {
  const { client, settings, patchSettings } = useConnection();
  const queryClient = useQueryClient();
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [createStoreOpen, setCreateStoreOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [isCreatingStore, setIsCreatingStore] = useState(false);

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeName.trim()) return;
    setIsCreatingStore(true);
    try {
      const created = await client.createStore({ name: storeName.trim() });
      patchSettings({ storeId: created.id, storeName: created.name, modelId: "" });
      await queryClient.invalidateQueries({ queryKey: ["stores"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      toast.success("Store created", { description: created.name });
      setStoreName("");
      setCreateStoreOpen(false);
    } catch (error) {
      toast.error("Store creation failed", { description: error instanceof Error ? error.message : "OpenFGA rejected the request." });
    } finally {
      setIsCreatingStore(false);
    }
  }

  const currentTitle = navigation.find((item) => item.id === activeView)?.label ?? "Overview";

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><ShieldCheck size={19} strokeWidth={2.2} /></div>
          <div className="brand-copy">
            <span className="brand-name">fga<span>console</span></span>
            <span className="brand-caption">OPENFGA ADMIN</span>
          </div>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {navigation.map(({ id, label, icon: Icon, hint }) => (
            <button
              aria-current={activeView === id ? "page" : undefined}
              className={`nav-item ${activeView === id ? "nav-item-active" : ""}`}
              key={id}
              onClick={() => onNavigate(id)}
              type="button"
            >
              <span className="nav-icon"><Icon size={17} strokeWidth={1.9} /></span>
              <span className="nav-copy"><span>{label}</span><small>{hint}</small></span>
              {activeView === id && <span className="nav-active-indicator" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-callout">
          <div className="callout-icon"><CircleHelp size={15} /></div>
          <div><strong>Need a hand?</strong><span>Explore the OpenFGA docs</span></div>
          <a aria-label="Open OpenFGA documentation" href="https://openfga.dev/docs" rel="noreferrer" target="_blank">↗</a>
        </div>
        <div className="sidebar-footer"><span className="footer-status-dot" /> Development console <span className="footer-version">v1.0</span></div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark"><ShieldCheck size={18} /></div><strong>fga<span>console</span></strong></div>
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{currentTitle}</strong></div>
          <div className="topbar-actions">
            <div className={`server-status ${storesError ? "server-status-error" : ""}`}>
              <span className={`status-dot ${storesError ? "status-dot-error" : storesLoading ? "status-dot-pending" : ""}`} />
              <span>{storesError ? "Disconnected" : storesLoading ? "Connecting" : "Connected"}</span>
            </div>
            <div className="topbar-divider" />
            <label className="store-select-wrap" htmlFor="active-store-select">
              <Database size={15} />
              <select
                aria-label="Select active OpenFGA store"
                id="active-store-select"
                onChange={(event) => {
                  const store = stores.find((item) => item.id === event.target.value);
                  patchSettings({ storeId: store?.id ?? "", storeName: store?.name ?? "", modelId: "" });
                  void queryClient.invalidateQueries();
                }}
                value={settings.storeId}
              >
                <option value="">Select store</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
              <ChevronDown aria-hidden className="select-chevron" size={14} />
            </label>
            <button aria-label="Create store" className="icon-button topbar-icon-button" onClick={() => setCreateStoreOpen(true)} title="Create store" type="button"><Plus size={17} /></button>
            <button aria-label="Connection settings" className="icon-button topbar-icon-button" onClick={() => setConnectionOpen(true)} title="Connection settings" type="button"><Settings2 size={17} /></button>
          </div>
        </header>

        {storesError && (
          <div className="connection-error-banner">
            <AlertCircle size={16} />
            <span>{storesError.message || "Could not reach OpenFGA."}</span>
            <button className="text-button" onClick={onRefreshStores} type="button">Retry</button>
            <button aria-label="Open connection settings" className="banner-settings" onClick={() => setConnectionOpen(true)} type="button">Configure connection</button>
          </div>
        )}

        <div className="page-content">{children}</div>

        <footer className="app-footer">
          <span><Activity size={13} /> OpenFGA authorization control plane</span>
          <span className="footer-endpoint"><span className="status-dot" /> {settings.apiUrl || "No server configured"}</span>
        </footer>
      </main>

      <ConnectionDialog onClose={() => setConnectionOpen(false)} open={connectionOpen} />
      <Modal
        description="Create an isolated authorization store for a tenant, application, or environment."
        onClose={() => setCreateStoreOpen(false)}
        open={createStoreOpen}
        title="Create a store"
      >
        <form className="modal-form" onSubmit={createStore}>
          <label className="field-label" htmlFor="new-store-name">Store name</label>
          <input autoFocus id="new-store-name" maxLength={128} onChange={(event) => setStoreName(event.target.value)} placeholder="e.g. acme-production" required value={storeName} />
          <p className="field-hint">Stores keep authorization models and relationship tuples isolated from each other.</p>
          <div className="modal-actions">
            <button className="button button-secondary" onClick={() => setCreateStoreOpen(false)} type="button">Cancel</button>
            <button className="button button-primary" disabled={isCreatingStore || !storeName.trim()} type="submit">
              {isCreatingStore ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
              {isCreatingStore ? "Creating…" : "Create store"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
