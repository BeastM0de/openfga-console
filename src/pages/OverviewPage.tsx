import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  Database,
  FileKey2,
  Gauge,
  GitBranch,
  Layers3,
  LoaderCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { readAllTuples, relationCountByName } from "../fga";
import { useConnection } from "../ConnectionContext";
import type { CheckEvent, DashboardView } from "../types";

interface OverviewPageProps {
  checkHistory: CheckEvent[];
  onNavigate: (view: DashboardView) => void;
}

const tooltipStyle = {
  backgroundColor: "#151b2a",
  border: "1px solid #293348",
  borderRadius: 10,
  color: "#e7edf8",
  fontSize: 12,
};

function buildCheckSeries(events: CheckEvent[]) {
  const slots = Array.from({ length: 10 }, (_, index) => {
    const time = Date.now() - (9 - index) * 60 * 60 * 1000;
    return { key: new Date(time).toISOString().slice(0, 13), label: new Date(time).toLocaleTimeString([], { hour: "numeric" }), allowed: 0, denied: 0 };
  });
  for (const event of events) {
    const key = new Date(event.createdAt).toISOString().slice(0, 13);
    const slot = slots.find((item) => item.key === key);
    if (slot) event.allowed ? slot.allowed++ : slot.denied++;
  }
  return slots;
}

export function OverviewPage({ checkHistory, onNavigate }: OverviewPageProps) {
  const { client, settings } = useConnection();
  const tupleQuery = useQuery({
    queryKey: ["tuples", settings.apiUrl, settings.storeId],
    queryFn: () => readAllTuples(client),
    enabled: Boolean(settings.storeId),
    staleTime: 30_000,
  });

  const tuples = tupleQuery.data?.tuples ?? [];
  const relations = useMemo(() => relationCountByName(tuples), [tuples]);
  const users = useMemo(() => new Set(tuples.map((tuple) => tuple.key.user)).size, [tuples]);
  const objects = useMemo(() => new Set(tuples.map((tuple) => tuple.key.object)).size, [tuples]);
  const checks = useMemo(() => buildCheckSeries(checkHistory), [checkHistory]);
  const allowedCount = checkHistory.filter((item) => item.allowed).length;
  const allowRate = checkHistory.length ? Math.round((allowedCount / checkHistory.length) * 100) : null;

  if (!settings.storeId) {
    return (
      <div className="empty-workspace panel">
        <div className="empty-icon"><Database size={22} /></div>
        <span className="eyebrow">NO ACTIVE STORE</span>
        <h1>Choose an authorization store</h1>
        <p>Connect to an OpenFGA server and select a store to inspect models, relationships, and permission checks.</p>
        <button className="button button-primary" onClick={() => onNavigate("models")} type="button">Explore model tools <ArrowRight size={16} /></button>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> AUTHORIZATION OVERVIEW</div>
          <h1>Good to see you, <span className="heading-accent">operator.</span></h1>
          <p>Monitor your authorization graph and validate access decisions across this store.</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={() => void tupleQuery.refetch()} type="button"><Activity size={15} /> Refresh data</button>
          <button className="button button-primary" onClick={() => onNavigate("playground")} type="button"><ShieldCheck size={15} /> Run a check</button>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard
          accent="blue"
          icon={<Database size={18} />}
          label="Relationship tuples"
          value={tupleQuery.isLoading ? "—" : tupleQuery.data?.truncated ? `${tuples.length}+` : tuples.length.toLocaleString()}
          foot={tupleQuery.data?.truncated ? "Showing first 10,000" : "Persisted relationships"}
          loading={tupleQuery.isLoading}
        />
        <MetricCard accent="violet" icon={<Users size={18} />} label="Principals" value={tupleQuery.isLoading ? "—" : users.toLocaleString()} foot="Unique tuple subjects" loading={tupleQuery.isLoading} />
        <MetricCard accent="teal" icon={<Layers3 size={18} />} label="Protected objects" value={tupleQuery.isLoading ? "—" : objects.toLocaleString()} foot="Unique tuple resources" loading={tupleQuery.isLoading} />
        <MetricCard accent="amber" icon={<Gauge size={18} />} label="Recent allow rate" value={allowRate === null ? "—" : `${allowRate}%`} foot={checkHistory.length ? `${checkHistory.length} checks this session` : "No checks yet this session"} loading={false} />
      </div>

      {tupleQuery.isError && <div className="inline-error"><span>{tupleQuery.error instanceof Error ? tupleQuery.error.message : "Unable to read tuples."}</span><button className="text-button" onClick={() => void tupleQuery.refetch()} type="button">Retry</button></div>}

      <div className="dashboard-grid dashboard-grid-main">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div><div className="panel-title">Authorization activity</div><div className="panel-subtitle">Checks performed in this browser session</div></div>
            <span className="live-label"><span className="live-dot" /> LIVE SESSION</span>
          </div>
          <div className="chart-container chart-container-area">
            {checkHistory.length ? (
              <ResponsiveContainer height="100%" width="100%">
                <AreaChart data={checks} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="allowedFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#55d6a5" stopOpacity={0.28} /><stop offset="95%" stopColor="#55d6a5" stopOpacity={0} /></linearGradient>
                    <linearGradient id="deniedFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ff7e7e" stopOpacity={0.2} /><stop offset="95%" stopColor="#ff7e7e" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="#20283a" strokeDasharray="3 5" vertical={false} />
                  <XAxis axisLine={false} dataKey="label" tick={{ fill: "#78859c", fontSize: 11 }} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#78859c", fontSize: 11 }} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area dataKey="allowed" fill="url(#allowedFill)" name="Allowed" stroke="#55d6a5" strokeWidth={2} type="monotone" />
                  <Area dataKey="denied" fill="url(#deniedFill)" name="Denied" stroke="#ff7e7e" strokeWidth={2} type="monotone" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <ChartEmpty icon={<Activity size={20} />} text="Run a permission check to start the activity timeline." />}
          </div>
          <div className="chart-legend"><span><i className="legend-dot allow-dot" /> Allowed</span><span><i className="legend-dot deny-dot" /> Denied</span><span className="chart-legend-note">Client-side session metrics · not server telemetry</span></div>
        </section>

        <section className="panel relation-panel">
          <div className="panel-heading">
            <div><div className="panel-title">Tuple distribution</div><div className="panel-subtitle">Relationships by relation</div></div>
            <button aria-label="Open tuple explorer" className="icon-button" onClick={() => onNavigate("tuples")} type="button"><ArrowRight size={16} /></button>
          </div>
          <div className="chart-container chart-container-bar">
            {tupleQuery.isLoading ? <ChartEmpty icon={<LoaderCircle className="spin" size={19} />} text="Loading tuple data…" /> : relations.length ? (
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={relations.slice(0, 6)} layout="vertical" margin={{ top: 2, right: 14, left: 4, bottom: 2 }}>
                  <CartesianGrid stroke="#20283a" strokeDasharray="3 5" horizontal={false} />
                  <XAxis axisLine={false} tick={{ fill: "#78859c", fontSize: 10 }} tickLine={false} type="number" />
                  <YAxis axisLine={false} dataKey="name" tick={{ fill: "#aab5c8", fontSize: 11 }} tickLine={false} type="category" width={74} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#ffffff08" }} />
                  <Bar background={{ fill: "#121827" }} dataKey="count" fill="#8b7bff" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartEmpty icon={<Database size={20} />} text="No relationship tuples in this store." />}
          </div>
          <div className="relation-panel-foot"><span className="foot-status"><CircleCheck size={14} /> Data read from active store</span><span>{tupleQuery.data?.truncated ? "10k+" : tuples.length} tuples</span></div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-bottom">
        <section className="panel quick-actions-panel">
          <div className="panel-heading"><div><div className="panel-title">Quick actions</div><div className="panel-subtitle">Common authorization workflows</div></div></div>
          <div className="quick-action-list">
            <QuickAction icon={<GitBranch size={16} />} title="Inspect authorization model" detail="Review relation rewrites and versions" onClick={() => onNavigate("models")} />
            <QuickAction icon={<Database size={16} />} title="Browse relationship tuples" detail="Search, import, export, and manage tuples" onClick={() => onNavigate("tuples")} />
            <QuickAction icon={<ShieldCheck size={16} />} title="Test a permission" detail="Run check, list objects, or list users" onClick={() => onNavigate("playground")} />
          </div>
        </section>
        <section className="panel recent-panel">
          <div className="panel-heading"><div><div className="panel-title">Recent checks</div><div className="panel-subtitle">Last decisions from this session</div></div><span className="small-count">{checkHistory.length}</span></div>
          {checkHistory.length ? (
            <div className="recent-check-list">
              {checkHistory.slice(0, 5).map((item) => (
                <div className="recent-check" key={item.id}>
                  <span className={`decision-icon ${item.allowed ? "decision-allow" : "decision-deny"}`}>{item.allowed ? <CircleCheck size={14} /> : <ArrowDownRight size={14} />}</span>
                  <div className="recent-check-main"><strong>{item.user}</strong><span>{item.relation} → {item.object}</span></div>
                  <time>{item.durationMs} ms</time>
                </div>
              ))}
            </div>
          ) : <ChartEmpty icon={<FileKey2 size={20} />} text="Your check results will appear here." />}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  accent,
  icon,
  label,
  value,
  foot,
  loading,
}: {
  accent: string;
  icon: ReactNode;
  label: string;
  value: string;
  foot: string;
  loading: boolean;
}) {
  return (
    <div className="metric-card panel">
      <div className={`metric-icon metric-icon-${accent}`}>{icon}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{loading ? <span className="metric-skeleton" /> : value}</div>
      <div className="metric-foot">{foot}</div>
      <ArrowUpRight className="metric-arrow" size={15} />
    </div>
  );
}

function ChartEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="chart-empty"><span>{icon}</span><p>{text}</p></div>;
}

function QuickAction({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick} type="button"><span className="quick-action-icon">{icon}</span><span className="quick-action-copy"><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={15} /></button>;
}
