import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { AppShell } from "./components/AppShell";
import { useConnection } from "./ConnectionContext";
import type { CheckEvent, DashboardView } from "./types";

const OverviewPage = lazy(() => import("./pages/OverviewPage").then((module) => ({ default: module.OverviewPage })));
const ModelsPage = lazy(() => import("./pages/ModelsPage").then((module) => ({ default: module.ModelsPage })));
const PlaygroundPage = lazy(() => import("./pages/PlaygroundPage").then((module) => ({ default: module.PlaygroundPage })));
const TuplesPage = lazy(() => import("./pages/TuplesPage").then((module) => ({ default: module.TuplesPage })));

export function App() {
  const { client, settings, patchSettings } = useConnection();
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [checkHistory, setCheckHistory] = useState<CheckEvent[]>([]);
  const storesQuery = useQuery({
    queryKey: ["stores", settings.apiUrl],
    queryFn: () => client.listStores({ pageSize: 100 }),
    enabled: Boolean(settings.apiUrl),
    refetchInterval: 30_000,
    retry: 1,
  });
  const stores = storesQuery.data?.stores ?? [];

  useEffect(() => {
    if (!stores.length) return;
    if (settings.storeId) {
      const active = stores.find((store) => store.id === settings.storeId);
      if (!active) return;
      if (settings.storeName !== active.name) patchSettings({ storeName: active.name });
      return;
    }
    const fallback = stores[0];
    patchSettings({ storeId: fallback.id, storeName: fallback.name, modelId: "" });
  }, [stores, settings.storeId, settings.storeName, patchSettings]);

  function recordCheck(event: CheckEvent) {
    setCheckHistory((current) => [event, ...current].slice(0, 100));
    if (event.allowed) toast.success("Permission allowed", { description: `${event.relation} on ${event.object}` });
  }

  let page;
  switch (activeView) {
    case "models": page = <ModelsPage />; break;
    case "tuples": page = <TuplesPage />; break;
    case "playground": page = <PlaygroundPage onCheck={recordCheck} />; break;
    default: page = <OverviewPage checkHistory={checkHistory} onNavigate={setActiveView} />;
  }

  return (
    <>
      <Toaster closeButton position="bottom-right" richColors theme="dark" />
      <AppShell
        activeView={activeView}
        onNavigate={setActiveView}
        onRefreshStores={() => void storesQuery.refetch()}
        stores={stores}
        storesError={storesQuery.error instanceof Error ? storesQuery.error : null}
        storesLoading={storesQuery.isLoading}
      >
        <Suspense fallback={<div className="route-loading"><span className="spin-loader" /><span>Loading console view…</span></div>}>
          {page}
        </Suspense>
      </AppShell>
    </>
  );
}
