"use client";

import { useEffect, useState } from "react";
import { fetchAnalyticsSummary, type AnalyticsSummary } from "../services/github";

const TYPE_COLORS: Record<string, string> = {
  bug: "from-rose-400 to-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.4)]",
  feature: "from-blue-400 to-indigo-600 shadow-[0_0_10px_rgba(99,102,241,0.4)]",
  documentation: "from-emerald-400 to-teal-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]",
  question: "from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]",
  enhancement: "from-purple-400 to-fuchsia-600 shadow-[0_0_10px_rgba(168,85,247,0.4)]",
  general: "from-zinc-400 to-zinc-600",
  unknown: "from-zinc-300 to-zinc-500",
};

function DonutBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  
  return (
    <div className="group flex items-center gap-4 transition-all hover:translate-x-1">
      <span className="w-32 shrink-0 text-sm font-medium capitalize text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-200 transition-colors">{label}</span>
      <div className="flex-1 rounded-full bg-zinc-200/50 dark:bg-zinc-800/50 h-3 overflow-hidden backdrop-blur-sm shadow-inner">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: mounted ? `${pct}%` : "0%" }}
        />
      </div>
      <div className="w-16 flex items-center justify-end gap-2 text-right">
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{value}</span>
        <span className="text-[10px] font-semibold text-zinc-400 w-7">({pct}%)</span>
      </div>
    </div>
  );
}

function WeekChart({ data }: { data: { label: string; count: number }[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const max = Math.max(...data.map((d) => d.count), 1);
  
  return (
    <div className="flex items-end justify-between h-48 w-full gap-2 relative mt-4">
      {/* Background Grid lines */}
      <div className="absolute inset-0 flex flex-col justify-between opacity-10 pointer-events-none border-y border-zinc-500 border-dashed">
         <div className="border-t border-zinc-500 w-full h-px"></div>
         <div className="border-t border-zinc-500 w-full h-px"></div>
         <div className="border-t border-zinc-500 w-full h-px"></div>
      </div>
      
      {data.map((d, i) => (
        <div key={d.label} className="group relative flex flex-1 flex-col items-center gap-2 z-10 h-full justify-end">
          {/* Tooltip */}
          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs py-1 px-2 rounded-md shadow-xl whitespace-nowrap z-20 pointer-events-none font-medium">
            {d.count} issues
          </div>
          <div
            className="w-full max-w-[32px] rounded-t-sm bg-gradient-to-t from-indigo-500/20 to-indigo-500 dark:from-indigo-400/20 dark:to-indigo-400 transition-all duration-1000 ease-out hover:brightness-125 hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]"
            style={{ 
              height: mounted ? `${(d.count / max) * 100}%` : "0%", 
              minHeight: mounted ? "4px" : "0px",
              transitionDelay: `${i * 50}ms`
            }}
          />
          <span
            className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-full -rotate-45 origin-top-left mt-2"
          >
            {d.label.split("/")[0]}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, delay }: { label: string; value: string | number; sub?: string, delay: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  return (
    <div 
      className={`relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/60 p-6 shadow-sm backdrop-blur-xl dark:border-zinc-800/80 dark:bg-zinc-900/60 transition-all duration-700 ease-out hover:-translate-y-1 hover:shadow-lg hover:border-indigo-500/30 group ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-2xl group-hover:from-indigo-500/20 group-hover:to-purple-500/20 transition-all duration-500" />
      
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 relative z-10">{label}</p>
      <p className="mt-2 text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 relative z-10 drop-shadow-sm">{value}</p>
      {sub && <p className="mt-2 text-sm font-medium text-zinc-500 relative z-10">{sub}</p>}
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
    <main className="min-h-screen bg-zinc-50 dark:bg-[#0a0a0c] p-6 sm:p-10 relative overflow-hidden font-sans selection:bg-indigo-500/30">
      {/* Background glowing orbs */}
      <div className="absolute top-0 left-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 h-[600px] w-[600px] translate-x-1/3 translate-y-1/3 rounded-full bg-purple-500/10 blur-[150px] pointer-events-none" />

      <div className="mx-auto max-w-6xl space-y-10 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold tracking-wide uppercase mb-3 border border-indigo-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Live Insights
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-400">
              Repository Intelligence
            </h1>
            <p className="mt-2 text-base text-zinc-500 dark:text-zinc-400 font-medium max-w-xl">
              Deep dive into project health, issue resolution trends, and categorical distribution of your codebase.
            </p>
          </div>
          
          {/* Repo selector */}
          <div className="flex flex-col sm:flex-row items-center gap-3 bg-white/50 dark:bg-zinc-900/50 p-2 rounded-2xl backdrop-blur-md border border-zinc-200/50 dark:border-zinc-800/50 shadow-xl">
            <input
              type="text"
              placeholder="Owner (e.g. facebook)"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full sm:w-40 rounded-xl border-none bg-zinc-100/50 px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-800/50 dark:text-white placeholder:text-zinc-400 transition-all"
            />
            <span className="hidden sm:block text-zinc-300 dark:text-zinc-600 font-light text-2xl">/</span>
            <input
              type="text"
              placeholder="Repo (e.g. react)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="w-full sm:w-40 rounded-xl border-none bg-zinc-100/50 px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-800/50 dark:text-white placeholder:text-zinc-400 transition-all"
            />
            <button
              onClick={() => {
                if (owner && repo) setQuery({ owner, repo });
              }}
              className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg hover:shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 transition-all hover:-translate-y-0.5 active:translate-y-0"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Analyzing
                </span>
              ) : "Analyze"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50/80 backdrop-blur-sm border border-red-200 px-5 py-4 text-sm font-medium text-red-800 shadow-sm dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400 animate-in fade-in slide-in-from-top-2">
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </span>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard delay={100} label="Total Issues" value={data.total_issues.toLocaleString()} />
              <StatCard
                delay={200}
                label="Open vs Closed"
                value={data.state.open.toLocaleString()}
                sub={`${data.state.closed.toLocaleString()} resolved issues`}
              />
              <StatCard
                delay={300}
                label="Duplicate Rate"
                value={`${data.duplicate_rate}%`}
                sub="Flagged as duplicate"
              />
              <StatCard
                delay={400}
                label="Primary Category"
                value={topType ? topType.charAt(0).toUpperCase() + topType.slice(1) : "—"}
                sub={topType ? `${data.by_type[topType]} occurrences` : undefined}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-500 fill-mode-both">
              {/* Issues by Type */}
              <div className="lg:col-span-5 rounded-3xl border border-zinc-200/60 bg-white/40 p-7 shadow-xl shadow-zinc-200/20 backdrop-blur-2xl dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:shadow-black/40 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-indigo-500/5 blur-3xl rounded-full pointer-events-none" />
                <div className="flex items-center justify-between mb-8 relative z-10">
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-indigo-500" />
                    Type Distribution
                  </h2>
                </div>
                <div className="space-y-5 relative z-10">
                  {(Object.entries(data.by_type) as [string, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <DonutBar
                        key={type}
                        label={type}
                        value={count}
                        total={data.total_issues}
                        color={TYPE_COLORS[type] ?? "from-zinc-400 to-zinc-500"}
                      />
                    ))}
                </div>
              </div>

              {/* Middle & Right Column Container */}
              <div className="lg:col-span-7 flex flex-col gap-6">
                {/* Criticality */}
                <div className="rounded-3xl border border-zinc-200/60 bg-white/40 p-7 shadow-xl shadow-zinc-200/20 backdrop-blur-2xl dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:shadow-black/40">
                  <h2 className="mb-6 text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-rose-500" />
                    Criticality Breakdown
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {[
                      { key: "high", label: "Critical / High", color: "from-rose-400 to-red-600 shadow-[0_0_15px_rgba(225,29,72,0.3)]", bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
                      { key: "medium", label: "Medium", color: "from-amber-400 to-orange-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]", bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
                      { key: "low", label: "Low / Routine", color: "from-emerald-400 to-teal-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
                    ].map(({ key, label, color, bg }) => {
                      const value = data.by_criticality[key] ?? 0;
                      const pct = data.total_issues > 0 ? Math.round((value / data.total_issues) * 100) : 0;
                      return (
                        <div key={key} className="flex flex-col items-center p-4 rounded-2xl bg-white/50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 transition-transform hover:-translate-y-1 hover:shadow-md">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-3 ${bg}`}>{label}</span>
                          <span className="text-3xl font-black text-zinc-900 dark:text-white mb-2">{value}</span>
                          <div className="w-full bg-zinc-200/50 dark:bg-zinc-700/50 h-1.5 rounded-full overflow-hidden">
                            <div className={`h-full bg-gradient-to-r ${color} rounded-full`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Weekly Trend */}
                {data.by_week.length > 0 && (
                  <div className="flex-1 rounded-3xl border border-zinc-200/60 bg-white/40 p-7 shadow-xl shadow-zinc-200/20 backdrop-blur-2xl dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:shadow-black/40 relative overflow-hidden flex flex-col">
                    <div className="absolute -bottom-20 -left-20 h-64 w-64 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center justify-between mb-8 relative z-10">
                      <span className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-violet-500" />
                        Resolution Trends
                      </span>
                      <span className="text-xs font-medium text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full">Last {data.by_week.length} Weeks</span>
                    </h2>
                    <div className="flex-1 min-h-[200px] flex items-end relative z-10 pb-8">
                       <WeekChart data={data.by_week} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!data && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-700 delay-200">
            <div className="h-24 w-24 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-6 shadow-inner">
              <svg className="w-10 h-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Ready to Analyze</h3>
            <p className="text-zinc-500 dark:text-zinc-400 text-center max-w-md">
              Enter a valid GitHub repository owner and name above to generate beautiful, interactive analytics instantly.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

