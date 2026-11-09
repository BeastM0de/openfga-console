import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { validator, transformer } from "@openfga/syntax-transformer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  GitBranch,
  History,
  LoaderCircle,
  Rocket,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useConnection } from "../ConnectionContext";
import { DEFAULT_MODEL_DSL } from "../fga";
import { openfgaDslLanguage } from "../languages/openfgaDsl";
import type { AuthorizationModel } from "@openfga/sdk";
import type { OpenFgaModel } from "../types";
import { ModelGraph } from "../components/ModelGraph";

type CompiledModel = Omit<AuthorizationModel, "id">;

async function loadModelHistory(client: ReturnType<typeof useConnection>["client"]) {
  const models: AuthorizationModel[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await client.readAuthorizationModels({ pageSize: 100, continuationToken });
    models.push(...page.authorization_models);
    continuationToken = page.continuation_token || undefined;
  } while (continuationToken && models.length < 500);
  return models;
}

function modelToDsl(model: AuthorizationModel): string {
  const { id: _id, ...requestModel } = model;
  return transformer.transformJSONToDSL(requestModel);
}

export function ModelsPage() {
  const { client, settings, patchSettings } = useConnection();
  const queryClient = useQueryClient();
  const [dsl, setDsl] = useState(DEFAULT_MODEL_DSL);
  const [isDirty, setIsDirty] = useState(false);
  const [loadedModelId, setLoadedModelId] = useState("");
  const [view, setView] = useState<"editor" | "graph">("editor");
  const [isDeploying, setIsDeploying] = useState(false);

  const historyQuery = useQuery({
    queryKey: ["models", settings.apiUrl, settings.storeId],
    queryFn: () => loadModelHistory(client),
    enabled: Boolean(settings.storeId),
    staleTime: 20_000,
  });
  const models = historyQuery.data ?? [];
  const selectedModelId = settings.modelId || models[0]?.id || "";
  const selectedModelQuery = useQuery({
    queryKey: ["model", settings.apiUrl, settings.storeId, selectedModelId],
    queryFn: () => client.readAuthorizationModel({ authorizationModelId: selectedModelId }),
    enabled: Boolean(settings.storeId && selectedModelId),
    staleTime: 60_000,
  });
  const selectedModel = selectedModelQuery.data?.authorization_model as OpenFgaModel | undefined;

  useEffect(() => {
    if (!selectedModel || selectedModel.id === loadedModelId || isDirty) return;
    try {
      setDsl(modelToDsl(selectedModel as AuthorizationModel));
      setLoadedModelId(selectedModel.id);
    } catch (error) {
      toast.error("Could not convert model to DSL", { description: error instanceof Error ? error.message : "Unknown model format." });
    }
  }, [selectedModel, loadedModelId, isDirty]);

  const validation = useMemo(() => {
    try {
      validator.validateDSL(dsl);
      const compiled = transformer.transformDSLToJSONObject(dsl) as CompiledModel;
      return { valid: true as const, model: compiled, message: "DSL syntax is valid" };
    } catch (error) {
      return {
        valid: false as const,
        model: undefined,
        message: error instanceof Error ? error.message : "The model could not be parsed.",
      };
    }
  }, [dsl]);

  async function deployModel() {
    if (!validation.valid) return;
    setIsDeploying(true);
    try {
      const result = await client.writeAuthorizationModel(validation.model);
      patchSettings({ modelId: result.authorization_model_id });
      setIsDirty(false);
      setLoadedModelId("");
      await queryClient.invalidateQueries({ queryKey: ["models", settings.apiUrl, settings.storeId] });
      await queryClient.invalidateQueries({ queryKey: ["model", settings.apiUrl, settings.storeId] });
      toast.success("Authorization model deployed", { description: `Model ${result.authorization_model_id}` });
    } catch (error) {
      toast.error("Model deployment failed", { description: error instanceof Error ? error.message : "OpenFGA rejected the model." });
    } finally {
      setIsDeploying(false);
    }
  }

  function selectVersion(modelId: string) {
    if (isDirty && !window.confirm("Discard your unsaved DSL edits and switch model versions?")) return;
    setIsDirty(false);
    setLoadedModelId("");
    patchSettings({ modelId });
  }

  if (!settings.storeId) {
    return <EmptyModelState title="Select a store to manage models" description="Authorization models are versioned independently inside each OpenFGA store." />;
  }

  return (
    <div className="page-stack">
      <div className="page-heading-row model-page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MODEL MANAGEMENT</div>
          <h1>Authorization <span className="heading-accent">models.</span></h1>
          <p>Author, validate, visualize, and version your relationship rewrites.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" disabled={!validation.valid} onClick={() => toast.success("Model validated", { description: "DSL parsed successfully. Semantic validation happens during deploy." })} type="button"><CheckCircle2 size={15} /> Validate DSL</button>
          <button className="button button-primary" disabled={!validation.valid || isDeploying} onClick={() => void deployModel()} type="button">
            {isDeploying ? <LoaderCircle className="spin" size={15} /> : <Rocket size={15} />}
            {isDeploying ? "Deploying…" : "Deploy model"}
          </button>
        </div>
      </div>

      <div className="model-meta-strip panel">
        <div className="model-meta-icon"><GitBranch size={16} /></div>
        <div className="model-meta-content"><span>ACTIVE MODEL</span><strong>{selectedModelId || "No model deployed"}</strong></div>
        <span className="schema-pill">{selectedModel?.schema_version ?? "schema 1.1"}</span>
        {isDirty && <span className="unsaved-pill"><span /> Unsaved changes</span>}
        <div className="model-view-toggle" role="group" aria-label="Model view">
          <button aria-pressed={view === "editor"} className={view === "editor" ? "toggle-active" : ""} onClick={() => setView("editor")} type="button"><Code2 size={14} /> Editor</button>
          <button aria-pressed={view === "graph"} className={view === "graph" ? "toggle-active" : ""} onClick={() => setView("graph")} type="button"><GitBranch size={14} /> Graph</button>
        </div>
      </div>

      <div className="models-layout">
        <section className="panel model-editor-panel">
          <div className="editor-toolbar">
            <div className="editor-file"><span className="file-dot" /><span>model.fga</span><small>OPENFGA DSL</small></div>
            <div className={`validation-state ${validation.valid ? "validation-valid" : "validation-invalid"}`}>
              {validation.valid ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              <span>{validation.valid ? validation.message : "Syntax error"}</span>
            </div>
          </div>
          {view === "editor" ? (
            <div className="dsl-editor-wrap">
              <CodeMirror
                basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, autocompletion: false }}
                extensions={[openfgaDslLanguage]}
                height="100%"
                onChange={(value) => { setDsl(value); setIsDirty(true); }}
                theme="dark"
                value={dsl}
              />
            </div>
          ) : (
            <ModelGraph model={selectedModel} />
          )}
          <div className={`editor-diagnostics ${validation.valid ? "diagnostic-success" : "diagnostic-error"}`}>
            {validation.valid ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{validation.valid ? "Ready to deploy. OpenFGA performs semantic checks on write." : validation.message}</span>
          </div>
        </section>

        <aside className="panel history-panel">
          <div className="panel-heading">
            <div><div className="panel-title"><History size={16} /> Version history</div><div className="panel-subtitle">Select a model version to inspect</div></div>
            <span className="small-count">{models.length}</span>
          </div>
          {historyQuery.isLoading ? (
            <div className="history-loading"><LoaderCircle className="spin" size={17} /> Loading history…</div>
          ) : historyQuery.isError ? (
            <div className="history-error"><AlertCircle size={16} />{historyQuery.error instanceof Error ? historyQuery.error.message : "Could not read model history."}</div>
          ) : models.length ? (
            <div className="history-list">
              {models.map((model, index) => {
                const active = selectedModelId === model.id;
                return (
                  <button className={`history-item ${active ? "history-item-active" : ""}`} key={model.id} onClick={() => selectVersion(model.id)} type="button">
                    <span className={`history-marker ${index === 0 ? "history-marker-latest" : ""}`} />
                    <span className="history-item-body">
                      <span className="history-item-top"><strong>{index === 0 ? "Latest version" : `Version ${models.length - index}`}</strong>{index === 0 && <span className="latest-pill">LATEST</span>}</span>
                      <code>{model.id}</code>
                      <small>Schema {model.schema_version} · {model.type_definitions.length} types</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="history-empty"><Clock3 size={19} /><strong>No model versions yet</strong><span>Validate and deploy a DSL model to create the first version.</span></div>
          )}
          <div className="history-note"><WandSparkles size={14} /> Models are immutable. Deploying creates a new version; it does not overwrite history.</div>
        </aside>
      </div>
    </div>
  );
}

function EmptyModelState({ title, description }: { title: string; description: string }) {
  return <div className="empty-workspace panel"><div className="empty-icon"><GitBranch size={22} /></div><span className="eyebrow">MODEL MANAGEMENT</span><h1>{title}</h1><p>{description}</p></div>;
}
