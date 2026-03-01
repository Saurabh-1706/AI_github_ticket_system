"use client";

import { useEffect, useState } from "react";
import { fetchAnalyticsSummary, type AnalyticsSummary } from "../services/github";

const TYPE_COLORS: Record<string, string> = {
  bug: "bg-red-500",
  feature: "bg-blue-500",
  documentation: "bg-green-500",
  question: "bg-yellow-500",
  enhancement: "bg-purple-500",
  general: "bg-zinc-400",
  unknown: "bg-zinc-300",
};

function DonutBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs capitalize text-zinc-600 dark:text-zinc-400">{label}</span>
      <div className="flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800 h-2.5 overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300">{value}</span>
    </div>
  );
}

function WeekChart({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1.5 h-32">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-indigo-500 dark:bg-indigo-400 transition-all duration-500"
            style={{ height: `${(d.count / max) * 100}%`, minHeight: "4px" }}
            title={`${d.label}: ${d.count} issues`}
          />
          <span
            className="text-[9px] text-zinc-400 truncate max-w-full"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", lineHeight: 1 }}
          >
            {d.label.split("/")[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-bold text-zinc-900 dark:text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [query, setQuery] = useState<{ owner: string; repo: string } | null>(null);
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from URL search params if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get("owner") || "";
    const r = params.get("repo") || "";
    if (o && r) {
      setOwner(o);
      setRepo(r);
      setQuery({ owner: o, repo: r });
    }
  }, []);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setError(null);
    setData(null);
    fetchAnalyticsSummary(query.owner, query.repo)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [query]);

  const topType = data
    ? Object.entries(data.by_type).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  return (
    <main className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">📊 Analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">Aggregated insights from your cached repository data</p>
        </div>

        {/* Repo selector */}
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Owner (e.g. facebook)"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <input
            type="text"
            placeholder="Repo (e.g. react)"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            onClick={() => {
              if (owner && repo) setQuery({ owner, repo });
            }}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Loading…" : "Analyze"}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
            ⚠️ {error}
          </div>
        )}

        {data && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Total Issues" value={data.total_issues.toLocaleString()} />
              <StatCard
                label="Open"
                value={data.state.open.toLocaleString()}
                sub={`${data.state.closed.toLocaleString()} closed`}
              />
              <StatCard
                label="Duplicate Rate"
                value={`${data.duplicate_rate}%`}
                sub="Issues flagged as duplicates"
              />
              <StatCard
                label="Top Type"
                value={topType ?? "—"}
                sub={topType ? `${data.by_type[topType]} issues` : undefined}
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Issues by Type */}
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Issues by Type</h2>
                <div className="space-y-3">
                  {(Object.entries(data.by_type) as [string, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <DonutBar
                        key={type}
                        label={type}
                        value={count}
                        total={data.total_issues}
                        color={TYPE_COLORS[type] ?? "bg-zinc-400"}
                      />
                    ))}
                </div>
              </div>

              {/* Criticality */}
              <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">Criticality</h2>
                <div className="space-y-3">
                  {[
                    { key: "high", color: "bg-red-500" },
                    { key: "medium", color: "bg-yellow-500" },
                    { key: "low", color: "bg-green-500" },
                  ].map(({ key, color }) => (
                    <DonutBar
                      key={key}
                      label={key}
                      value={data.by_criticality[key] ?? 0}
                      total={data.total_issues}
                      color={color}
                    />
                  ))}
                </div>
              </div>

              {/* Weekly Trend */}
              {data.by_week.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:col-span-2">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
                    Issues Opened per Week (last {data.by_week.length} weeks)
                  </h2>
                  <WeekChart data={data.by_week} />
                </div>
              )}
            </div>
          </>
        )}

        {!data && !loading && !error && (
          <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center text-zinc-400 dark:border-zinc-700">
            Enter an owner and repo name above to see analytics.
          </div>
        )}
      </div>
    </main>
  );
}
