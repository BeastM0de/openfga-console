import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  LoaderCircle,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useConnection } from "../ConnectionContext";
import { getModelTypes, getRelationsForType } from "../fga";
import type { CheckEvent, OpenFgaModel } from "../types";

interface PlaygroundPageProps {
  onCheck: (event: CheckEvent) => void;
}

export function PlaygroundPage({ onCheck }: PlaygroundPageProps) {
  const { client, settings } = useConnection();
  const [user, setUser] = useState("user:alice");
  const [relation, setRelation] = useState("can_view");
  const [object, setObject] = useState("document:handbook");
  const [checkResult, setCheckResult] = useState<{ allowed: boolean; latency: number; checkedAt: number }>();
  const [checkLoading, setCheckLoading] = useState(false);
  const [listUser, setListUser] = useState("user:alice");
  const [listRelation, setListRelation] = useState("can_view");
  const [listType, setListType] = useState("document");
  const [objectsResult, setObjectsResult] = useState<string[]>();
  const [objectsLoading, setObjectsLoading] = useState(false);
  const [listObject, setListObject] = useState("document:handbook");
  const [listUsersRelation, setListUsersRelation] = useState("can_view");
  const [userTypeFilter, setUserTypeFilter] = useState("user");
  const [usersResult, setUsersResult] = useState<unknown[]>();
  const [usersLoading, setUsersLoading] = useState(false);

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
  const model = modelQuery.data;
  const types = useMemo(() => getModelTypes(model), [model]);
  const objectType = object.split(":")[0] ?? "";
  const relationOptions = getRelationsForType(model, objectType);
  const listObjectType = listObject.split(":")[0] ?? "";
  const listUsersRelationOptions = getRelationsForType(model, listObjectType);

  async function runCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckLoading(true);
    const started = performance.now();
    try {
      const response = await client.check({ user: user.trim(), relation: relation.trim(), object: object.trim() });
      const latency = Math.round(performance.now() - started);
      const checkedAt = Date.now();
      const allowed = response.allowed === true;
      setCheckResult({ allowed, latency, checkedAt });
      onCheck({ id: crypto.randomUUID(), allowed, user: user.trim(), relation: relation.trim(), object: object.trim(), durationMs: latency, createdAt: checkedAt });
    } catch (error) {
      toast.error("Check request failed", { description: error instanceof Error ? error.message : "OpenFGA could not evaluate this request." });
    } finally {
      setCheckLoading(false);
    }
  }

  async function runListObjects(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setObjectsLoading(true);
    try {
      const response = await client.listObjects({ user: listUser.trim(), relation: listRelation.trim(), type: listType });
      setObjectsResult(response.objects);
    } catch (error) {
      toast.error("List objects failed", { description: error instanceof Error ? error.message : "OpenFGA could not list objects." });
    } finally {
      setObjectsLoading(false);
    }
  }

  async function runListUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [type, ...idParts] = listObject.trim().split(":");
    const id = idParts.join(":");
    if (!type || !id) {
      toast.error("Object must use type:id format", { description: "For example: document:handbook" });
      return;
    }
    setUsersLoading(true);
    try {
      const response = await client.listUsers({
        object: { type, id },
        relation: listUsersRelation.trim(),
        user_filters: [{ type: userTypeFilter.trim() || "user" }],
      });
      setUsersResult(response.users);
    } catch (error) {
      toast.error("List users failed", { description: error instanceof Error ? error.message : "OpenFGA could not list users." });
    } finally {
      setUsersLoading(false);
    }
  }

  if (!settings.storeId) {
    return <div className="empty-workspace panel"><div className="empty-icon"><ShieldCheck size={22} /></div><span className="eyebrow">PERMISSION PLAYGROUND</span><h1>Select a store to test access</h1><p>Checks require an active OpenFGA store. Choose one from the header to begin.</p></div>;
  }

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> INTERACTIVE TESTING</div>
          <h1>Permission <span className="heading-accent">playground.</span></h1>
          <p>Evaluate the active model against real tuples in <strong>{settings.storeName || "the selected store"}</strong>.</p>
        </div>
        <div className="model-selected-badge"><span className="status-dot" />{settings.modelId ? `Model ${settings.modelId.slice(0, 10)}…` : "Latest model"}</div>
      </div>

      <section className="playground-check-layout">
        <div className="panel check-form-panel">
          <div className="panel-heading">
            <div className="panel-heading-icon"><ShieldCheck size={16} /></div>
            <div><div className="panel-title">Authorization check</div><div className="panel-subtitle">Will this user have this relation to the object?</div></div>
            <span className="api-method-badge">CHECK</span>
          </div>
          <form className="playground-form" onSubmit={runCheck}>
            <label className="field-label" htmlFor="check-user">User</label>
            <input id="check-user" list="known-model-types" onChange={(event) => setUser(event.target.value)} placeholder="user:alice" required value={user} />
            <label className="field-label" htmlFor="check-object">Object</label>
            <input id="check-object" list="known-objects" onChange={(event) => { setObject(event.target.value); setRelation(""); }} placeholder="document:handbook" required value={object} />
            <label className="field-label" htmlFor="check-relation">Relation / permission</label>
            <input id="check-relation" list="check-relation-options" onChange={(event) => setRelation(event.target.value)} placeholder="can_view" required value={relation} />
            <datalist id="known-model-types">{types.map((type) => <option key={type} value={`${type}:`} />)}</datalist>
            <datalist id="known-objects">{(model?.type_definitions ?? []).map((definition) => <option key={definition.type} value={`${definition.type}:`} />)}</datalist>
            <datalist id="check-relation-options">{relationOptions.map((item) => <option key={item} value={item} />)}</datalist>
            <button className="button button-primary button-full" disabled={checkLoading || modelQuery.isLoading} type="submit">
              {checkLoading ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
              {checkLoading ? "Evaluating…" : "Evaluate permission"}
            </button>
          </form>
        </div>

        <div className={`panel decision-panel ${checkResult ? checkResult.allowed ? "decision-panel-allowed" : "decision-panel-denied" : "decision-panel-idle"}`}>
          {checkResult ? (
            <>
              <div className={`decision-orb ${checkResult.allowed ? "decision-orb-allowed" : "decision-orb-denied"}`}>
                {checkResult.allowed ? <CircleCheck size={30} /> : <ShieldAlert size={30} />}
              </div>
              <span className="decision-overline">OPENFGA DECISION</span>
              <h2 className={checkResult.allowed ? "text-allowed" : "text-denied"}>{checkResult.allowed ? "ALLOWED" : "DENIED"}</h2>
              <p>{checkResult.allowed ? "This relationship is permitted by the active authorization model." : "No matching relationship path grants this permission."}</p>
              <div className="decision-metadata"><span><Clock3 size={14} /> {checkResult.latency} ms</span><span>{new Date(checkResult.checkedAt).toLocaleTimeString()}</span></div>
            </>
          ) : (
            <>
              <div className="decision-orb decision-orb-idle"><CircleHelp size={28} /></div>
              <span className="decision-overline">READY TO EVALUATE</span>
              <h2>Run a check</h2>
              <p>Enter a user, permission, and object to inspect how OpenFGA resolves the relationship.</p>
              <div className="decision-metadata"><span><span className="status-dot" /> Connected to store</span><span>Schema {model?.schema_version ?? "—"}</span></div>
            </>
          )}
        </div>
      </section>

      <div className="playground-tools-grid">
        <section className="panel tool-panel">
          <div className="panel-heading">
            <div className="panel-heading-icon panel-icon-violet"><Search size={16} /></div>
            <div><div className="panel-title">List objects</div><div className="panel-subtitle">Find objects a user can access</div></div>
            <span className="api-method-badge">LIST OBJECTS</span>
          </div>
          <form className="tool-form" onSubmit={runListObjects}>
            <div className="tool-form-row"><label className="field-stack"><span className="field-label">User</span><input onChange={(event) => setListUser(event.target.value)} placeholder="user:alice" required value={listUser} /></label><label className="field-stack"><span className="field-label">Relation</span><input onChange={(event) => setListRelation(event.target.value)} placeholder="can_view" required value={listRelation} /></label></div>
            <label className="field-stack"><span className="field-label">Object type</span><select onChange={(event) => setListType(event.target.value)} value={listType}>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <button className="button button-secondary" disabled={objectsLoading} type="submit">{objectsLoading ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}List accessible objects</button>
          </form>
          {objectsResult && <ResultList empty="No objects matched this relationship." items={objectsResult} label={`${objectsResult.length} objects`} />}
        </section>

        <section className="panel tool-panel">
          <div className="panel-heading">
            <div className="panel-heading-icon panel-icon-teal"><Users size={16} /></div>
            <div><div className="panel-title">List users</div><div className="panel-subtitle">Find users related to an object</div></div>
            <span className="api-method-badge">LIST USERS</span>
          </div>
          <form className="tool-form" onSubmit={runListUsers}>
            <div className="tool-form-row"><label className="field-stack"><span className="field-label">Object</span><input onChange={(event) => setListObject(event.target.value)} placeholder="document:handbook" required value={listObject} /></label><label className="field-stack"><span className="field-label">Relation</span><input list="list-users-relations" onChange={(event) => setListUsersRelation(event.target.value)} placeholder="can_view" required value={listUsersRelation} /><datalist id="list-users-relations">{listUsersRelationOptions.map((item) => <option key={item} value={item} />)}</datalist></label></div>
            <label className="field-stack"><span className="field-label">User type filter</span><select onChange={(event) => setUserTypeFilter(event.target.value)} value={userTypeFilter}>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <button className="button button-secondary" disabled={usersLoading} type="submit">{usersLoading ? <LoaderCircle className="spin" size={15} /> : <Users size={15} />}List related users</button>
          </form>
          {usersResult && <ResultList empty="No users matched this relationship." items={usersResult.map((item) => JSON.stringify(item))} label={`${usersResult.length} results`} />}
        </section>
      </div>

      <div className="playground-footnote"><ShieldCheck size={14} /><span>Checks use the OpenFGA SDK and never modify relationship tuples.</span><a href="https://openfga.dev/docs/getting-started/perform-check" rel="noreferrer" target="_blank">Learn about checks <ArrowUpRight size={13} /></a></div>
    </div>
  );
}

function ResultList({ items, label, empty }: { items: string[]; label: string; empty: string }) {
  return (
    <div className="tool-results">
      <div className="tool-results-heading"><strong>{label}</strong><span>{items.length}</span></div>
      {items.length ? items.slice(0, 50).map((item, index) => <code key={`${item}-${index}`}>{item}</code>) : <span className="results-empty">{empty}</span>}
      {items.length > 50 && <span className="results-more">Showing first 50 results.</span>}
    </div>
  );
}
