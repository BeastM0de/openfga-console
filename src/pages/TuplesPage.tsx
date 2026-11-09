import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Papa from "papaparse";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Database,
  FileJson2,
  FileUp,
  Filter,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  ClientWriteRequestOnDuplicateWrites,
  ClientWriteRequestOnMissingDeletes,
  type TupleKey,
  type TupleKeyWithoutCondition,
} from "@openfga/sdk";
import { toast } from "sonner";
import { useConnection } from "../ConnectionContext";
import { getModelTypes, getRelationsForType, readAllTuples } from "../fga";
import type { OpenFgaModel } from "../types";
import { Modal } from "../components/Modal";

const ROWS_PER_PAGE = 20;

function safeFileName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "") || "openfga-store";
}

function triggerDownload(content: string, fileName: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeTuple(item: unknown): TupleKey | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const candidate = record.key && typeof record.key === "object" ? record.key as Record<string, unknown> : record;
  if (typeof candidate.user !== "string" || typeof candidate.relation !== "string" || typeof candidate.object !== "string") return null;

  const tuple: TupleKey = {
    user: candidate.user.trim(),
    relation: candidate.relation.trim(),
    object: candidate.object.trim(),
  };
  if (!tuple.user || !tuple.relation || !tuple.object) return null;
  if (candidate.condition && typeof candidate.condition === "object") {
    tuple.condition = candidate.condition as TupleKey["condition"];
  }
  return tuple;
}

function parseCsvTuples(text: string): TupleKey[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (header) => header.trim().toLowerCase() });
  if (parsed.errors.length) throw new Error(parsed.errors[0]?.message ?? "CSV could not be parsed");
  const tuples = parsed.data.map((row) => {
    let condition: TupleKey["condition"];
    if (row.condition_name?.trim()) {
      let context: object | undefined;
      if (row.condition_context_json?.trim()) context = JSON.parse(row.condition_context_json) as object;
      condition = { name: row.condition_name.trim(), context };
    }
    return normalizeTuple({ user: row.user, relation: row.relation, object: row.object, condition });
  }).filter((tuple): tuple is TupleKey => tuple !== null);
  if (!tuples.length) throw new Error("No valid tuples found. CSV requires user, relation, and object columns.");
  return tuples;
}

function parseImport(text: string, fileName: string): TupleKey[] {
  if (fileName.toLowerCase().endsWith(".csv")) return parseCsvTuples(text);
  const parsed: unknown = JSON.parse(text);
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tuples?: unknown[] }).tuples)
      ? (parsed as { tuples: unknown[] }).tuples
      : [];
  const tuples = items.map(normalizeTuple).filter((tuple): tuple is TupleKey => tuple !== null);
  if (!tuples.length) throw new Error("No valid tuples found. Expected JSON array or { tuples: [...] }.");
  return tuples;
}

export function TuplesPage() {
  const { client, settings } = useConnection();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [user, setUser] = useState("");
  const [relation, setRelation] = useState("");
  const [object, setObject] = useState("");
  const [conditionName, setConditionName] = useState("");
  const [conditionContext, setConditionContext] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [importing, setImporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const tupleQuery = useQuery({
    queryKey: ["tuples", settings.apiUrl, settings.storeId],
    queryFn: () => readAllTuples(client),
    enabled: Boolean(settings.storeId),
    staleTime: 15_000,
  });
  const modelQuery = useQuery({
    queryKey: ["model", settings.apiUrl, settings.storeId, settings.modelId],
    queryFn: async () => {
      const response = settings.modelId
        ? await client.readAuthorizationModel({ authorizationModelId: settings.modelId })
        : await client.readLatestAuthorizationModel();
      return response.authorization_model as OpenFgaModel | undefined;
    },
    enabled: Boolean(settings.storeId),
    staleTime: 60_000,
  });

  const tuples = tupleQuery.data?.tuples ?? [];
  const model = modelQuery.data;
  const userSuggestions = useMemo(() => [...new Set(tuples.map((tuple) => tuple.key.user))].sort().slice(0, 100), [tuples]);
  const objectSuggestions = useMemo(() => [...new Set(tuples.map((tuple) => tuple.key.object))].sort().slice(0, 150), [tuples]);
  const relationSuggestions = useMemo(() => {
    const objectType = object.split(":")[0] ?? "";
    const relations = getRelationsForType(model, objectType);
    return relations.length ? relations : [...new Set(model?.type_definitions?.flatMap((item) => Object.keys(item.relations ?? {})) ?? [])].sort();
  }, [model, object]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tuples;
    return tuples.filter((tuple) => `${tuple.key.user} ${tuple.key.relation} ${tuple.key.object} ${tuple.key.condition?.name ?? ""}`.toLowerCase().includes(needle));
  }, [tuples, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const visible = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  async function refreshTuples() {
    await queryClient.invalidateQueries({ queryKey: ["tuples", settings.apiUrl, settings.storeId] });
  }

  async function addTuple(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tuple: TupleKey = { user: user.trim(), relation: relation.trim(), object: object.trim() };
    if (!tuple.user || !tuple.relation || !tuple.object) return;
    if (conditionName.trim()) {
      let context: object | undefined;
      if (conditionContext.trim()) {
        try { context = JSON.parse(conditionContext) as object; }
        catch { toast.error("Condition context must be valid JSON"); return; }
      }
      tuple.condition = { name: conditionName.trim(), context };
    }

    setIsWriting(true);
    try {
      await client.writeTuples([tuple], { conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore } });
      toast.success("Relationship tuple written", { description: `${tuple.user} ${tuple.relation} ${tuple.object}` });
      setAddOpen(false);
      setUser(""); setRelation(""); setObject(""); setConditionName(""); setConditionContext("");
      await refreshTuples();
    } catch (error) {
      toast.error("Could not write tuple", { description: error instanceof Error ? error.message : "OpenFGA rejected the tuple." });
    } finally {
      setIsWriting(false);
    }
  }

  async function deleteTuple(tuple: TupleKeyWithoutCondition) {
    if (!window.confirm(`Delete ${tuple.user} ${tuple.relation} ${tuple.object}?`)) return;
    try {
      await client.deleteTuples([tuple], { conflict: { onMissingDeletes: ClientWriteRequestOnMissingDeletes.Ignore } });
      toast.success("Tuple deleted");
      await refreshTuples();
    } catch (error) {
      toast.error("Could not delete tuple", { description: error instanceof Error ? error.message : "OpenFGA rejected the delete." });
    }
  }

  function exportJson() {
    const exported = tuples.map((tuple) => tuple.key);
    triggerDownload(JSON.stringify(exported, null, 2), `${safeFileName(settings.storeName)}-tuples.json`, "application/json");
    toast.success("JSON export downloaded", { description: `${exported.length} tuples` });
  }

  function exportCsv() {
    const rows = tuples.map(({ key }) => ({
      user: key.user,
      relation: key.relation,
      object: key.object,
      condition_name: key.condition?.name ?? "",
      condition_context_json: key.condition?.context ? JSON.stringify(key.condition.context) : "",
    }));
    triggerDownload(Papa.unparse(rows), `${safeFileName(settings.storeName)}-tuples.csv`, "text/csv;charset=utf-8");
    toast.success("CSV export downloaded", { description: `${rows.length} tuples` });
  }

  async function importFile(file?: File) {
    if (!file) return;
    setImporting(true);
    try {
      const tuplesToWrite = parseImport(await file.text(), file.name);
      let imported = 0;
      for (let offset = 0; offset < tuplesToWrite.length; offset += 100) {
        const batch = tuplesToWrite.slice(offset, offset + 100);
        await client.writeTuples(batch, { conflict: { onDuplicateWrites: ClientWriteRequestOnDuplicateWrites.Ignore } });
        imported += batch.length;
      }
      toast.success("Tuple import complete", { description: `${imported.toLocaleString()} relationship tuples processed.` });
      await refreshTuples();
    } catch (error) {
      toast.error("Tuple import failed", { description: error instanceof Error ? error.message : "The selected file could not be imported." });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!settings.storeId) return <div className="empty-workspace panel"><div className="empty-icon"><Database size={22} /></div><span className="eyebrow">DATA EXPLORER</span><h1>Select a store to browse tuples</h1><p>Relationship tuples are scoped to the active OpenFGA store.</p></div>;

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> RELATIONSHIP DATA</div>
          <h1>Tuple <span className="heading-accent">explorer.</span></h1>
          <p>Inspect and manage the facts that power your authorization graph.</p>
        </div>
        <div className="heading-actions tuple-heading-actions">
          <button className="button button-secondary" disabled={importing} onClick={() => fileInputRef.current?.click()} type="button">
            {importing ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />}{importing ? "Importing…" : "Import"}
          </button>
          <button className="button button-secondary" disabled={!tuples.length} onClick={exportCsv} type="button"><ArrowDownToLine size={15} /> Export CSV</button>
          <button className="button button-secondary" disabled={!tuples.length} onClick={exportJson} type="button"><FileJson2 size={15} /> JSON</button>
          <button className="button button-primary" onClick={() => setAddOpen(true)} type="button"><Plus size={15} /> Add tuple</button>
          <input accept=".json,.csv,application/json,text/csv" className="hidden-file-input" onChange={(event) => void importFile(event.target.files?.[0])} ref={fileInputRef} type="file" />
        </div>
      </div>

      {tupleQuery.data?.truncated && <div className="inline-warning"><TriangleAlert size={15} /> Showing the first {tuples.length.toLocaleString()} tuples. Export/import operates on the loaded page set; use API pagination for larger migrations.</div>}

      <section className="panel tuple-table-panel">
        <div className="table-toolbar">
          <div className="table-toolbar-left"><span className="table-title">Relationships</span><span className="small-count">{tupleQuery.isLoading ? "…" : filtered.length.toLocaleString()}</span></div>
          <div className="table-toolbar-actions">
          <label className="table-search"><Search size={15} /><input aria-label="Search tuples" onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Filter by user, relation, object…" ref={searchInputRef} value={search} /><kbd>⌘ K</kbd></label>
            <button aria-label="Refresh tuples" className="icon-button" onClick={() => void refreshTuples()} title="Refresh" type="button"><RefreshCw size={15} /></button>
            <button aria-label="Tuple filters" className="icon-button" onClick={() => toast.info("Use the search field to filter tuples by user, relation, object, or condition.")} title="Filter" type="button"><Filter size={15} /></button>
          </div>
        </div>

        {tupleQuery.isLoading ? (
          <div className="table-loading"><LoaderCircle className="spin" size={20} /> Loading relationship tuples…</div>
        ) : tupleQuery.isError ? (
          <div className="table-loading table-error">{tupleQuery.error instanceof Error ? tupleQuery.error.message : "Could not read tuples."}<button className="button button-secondary" onClick={() => void tupleQuery.refetch()} type="button">Retry</button></div>
        ) : (
          <div className="table-scroll">
            <table className="tuple-table">
              <thead><tr><th>User</th><th>Relation</th><th>Object</th><th>Condition</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {visible.map((tuple, index) => (
                  <tr key={`${tuple.key.user}-${tuple.key.relation}-${tuple.key.object}-${tuple.timestamp}-${index}`}>
                    <td><span className="tuple-user"><span className="tuple-user-dot" />{tuple.key.user}</span></td>
                    <td><span className="relation-pill">{tuple.key.relation}</span></td>
                    <td><code className="object-code">{tuple.key.object}</code></td>
                    <td>{tuple.key.condition ? <span className="condition-chip">{tuple.key.condition.name}</span> : <span className="empty-cell">—</span>}</td>
                    <td><time className="tuple-time">{new Date(tuple.timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time></td>
                    <td><button aria-label={`Delete ${tuple.key.user} ${tuple.key.relation} ${tuple.key.object}`} className="icon-button danger-icon" onClick={() => void deleteTuple(tuple.key)} title="Delete tuple" type="button"><Trash2 size={15} /></button></td>
                  </tr>
                ))}
                {!visible.length && <tr><td className="empty-table-cell" colSpan={6}>{search ? "No tuples match this filter." : "This store has no relationship tuples yet."}</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <div className="table-footer">
          <span>Page {page + 1} of {pageCount} <span className="footer-separator">·</span> {filtered.length.toLocaleString()} rows</span>
          <div className="pagination-actions">
            <button className="button button-quiet button-small" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button"><ArrowLeft size={14} /> Previous</button>
            <button className="button button-quiet button-small" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} type="button">Next <ArrowRight size={14} /></button>
          </div>
        </div>
      </section>

      <div className="tuple-footnote"><span className="foot-status"><Database size={14} /> Connected to {settings.storeName || settings.storeId}</span><span>Writes are atomic per batch · duplicate imports are ignored</span></div>

      <Modal description="Direct relationship tuples are the source facts evaluated by OpenFGA." onClose={() => setAddOpen(false)} open={addOpen} title="Add relationship tuple">
        <form className="modal-form" onSubmit={addTuple}>
          <label className="field-label" htmlFor="tuple-user">User / subject</label>
          <input autoComplete="off" id="tuple-user" list="tuple-user-suggestions" onChange={(event) => setUser(event.target.value)} placeholder="user:alice or workspace:acme#member" required value={user} />
          <datalist id="tuple-user-suggestions">{userSuggestions.map((value) => <option key={value} value={value} />)}{getModelTypes(model).map((type) => <option key={type} value={`${type}:`} />)}</datalist>

          <label className="field-label" htmlFor="tuple-object">Object</label>
          <input autoComplete="off" id="tuple-object" list="tuple-object-suggestions" onChange={(event) => { setObject(event.target.value); setRelation(""); }} placeholder="document:handbook" required value={object} />
          <datalist id="tuple-object-suggestions">{objectSuggestions.map((value) => <option key={value} value={value} />)}{getModelTypes(model).map((type) => <option key={type} value={`${type}:`} />)}</datalist>

          <label className="field-label" htmlFor="tuple-relation">Relation</label>
          <input autoComplete="off" id="tuple-relation" list="tuple-relation-suggestions" onChange={(event) => setRelation(event.target.value)} placeholder="reader" required value={relation} />
          <datalist id="tuple-relation-suggestions">{relationSuggestions.map((value) => <option key={value} value={value} />)}</datalist>
          <p className="field-hint">Suggestions are derived from the active model; OpenFGA validates the tuple on write.</p>

          <details className="advanced-fields"><summary>Optional relationship condition</summary>
            <div className="field-stack"><label className="field-label" htmlFor="condition-name">Condition name</label><input id="condition-name" onChange={(event) => setConditionName(event.target.value)} placeholder="e.g. non_expired" value={conditionName} /></div>
            <div className="field-stack"><label className="field-label" htmlFor="condition-context">Condition context (JSON)</label><textarea className="context-textarea" id="condition-context" onChange={(event) => setConditionContext(event.target.value)} placeholder={'{ "current_time": "2026-01-01T00:00:00Z" }'} value={conditionContext} /></div>
          </details>

          <div className="modal-actions">
            <button className="button button-secondary" onClick={() => setAddOpen(false)} type="button">Cancel</button>
            <button className="button button-primary" disabled={isWriting} type="submit">{isWriting ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}{isWriting ? "Writing…" : "Write tuple"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
