"use client";

import { useState } from "react";
import { fetchRiskReport, type RiskReport } from "../services/github";

interface Props {
  owner: string;
  repo: string;
}

// ─── Style maps ──────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  High:     "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Medium:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  Low:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

const RISK_LEVEL_STYLE: Record<string, { border: string }> = {
  Critical: { border: "border-red-300 dark:border-red-800" },
  High:     { border: "border-orange-300 dark:border-orange-800" },
  Medium:   { border: "border-yellow-300 dark:border-yellow-800" },
  Low:      { border: "border-emerald-300 dark:border-emerald-800" },
};

const AREA_LABELS: Record<string, string> = {
  code_quality:   "Code Quality",
  security:       "Security",
  technical_debt: "Tech Debt",
  team_velocity:  "Team Velocity",
  reliability:    "Reliability",
};

// RGB hex → [r,g,b]
const SEVERITY_RGB: Record<string, [number, number, number]> = {
  Critical: [220, 38, 38], High: [234, 88, 12], Medium: [202, 138, 4], Low: [22, 163, 74],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function MiniBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-semibold w-8 text-right text-zinc-600 dark:text-zinc-400">{value}</span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900 dark:text-white">{value}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── PDF generation via jsPDF (direct download — no dialog) ──────────────────

async function downloadPDF(report: RiskReport, owner: string, repo: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PW = 210, M = 16, CW = PW - M * 2;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  let y = M;

  const scoreRgb: [number, number, number] =
    report.risk_score >= 75 ? [220, 38, 38]
    : report.risk_score >= 50 ? [234, 88, 12]
    : report.risk_score >= 25 ? [202, 138, 4]
    : [22, 163, 74];

  const levelRgb: [number, number, number] = SEVERITY_RGB[report.risk_level] ?? [107, 114, 128];

  // helpers
  const sf = (sz: number, bold = false, clr: [number,number,number] = [17,24,39]) => {
    doc.setFontSize(sz);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(clr[0], clr[1], clr[2]);
  };
  const fillRect = (x: number, yy: number, w: number, h: number, clr: [number,number,number], r = 2) => {
    doc.setFillColor(clr[0], clr[1], clr[2]);
    doc.roundedRect(x, yy, w, h, r, r, "F");
  };
  const rule = (yy: number) => {
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
    doc.line(M, yy, PW - M, yy);
  };
  const need = (n: number) => { if (y + n > 280) { doc.addPage(); y = M; } };

  // ── Header
  sf(8, false, [107,114,128]);
  doc.text("RISK ASSESSMENT REPORT", M, y); y += 6;
  sf(16, true, [17,24,39]);
  doc.text(`${owner}/${repo}`, M, y); y += 5;
  sf(8, false, [156,163,175]);
  doc.text(`Generated ${date}`, M, y); y += 10;

  // ── Score banner
  fillRect(M, y, CW, 30, [249,250,251], 3);
  // Score circle
  doc.setDrawColor(scoreRgb[0], scoreRgb[1], scoreRgb[2]);
  doc.setLineWidth(2.5);
  doc.circle(M + 20, y + 15, 11, "D");
  sf(10, true, scoreRgb);
  doc.text(String(report.risk_score), M + 20, y + 18.5, { align: "center" });
  // Level badge
  const badgeBg: [number,number,number] = levelRgb.map(c => Math.min(c + 170, 245)) as [number,number,number];
  fillRect(M + 36, y + 5, 30, 7, badgeBg, 3);
  sf(7, true, levelRgb);
  doc.text(`${report.risk_level.toUpperCase()} RISK`, M + 36 + 15, y + 10, { align: "center" });
  // Summary
  sf(8, false, [55,65,81]);
  const sumLines = doc.splitTextToSize(report.executive_summary, CW - 72);
  doc.text(sumLines.slice(0, 3), M + 70, y + 10);
  y += 36;

  // ── Stats grid
  rule(y); y += 5;
  sf(8, true, [107,114,128]);
  doc.text("ISSUE STATISTICS", M, y); y += 4;

  const statItems = [
    ["Total Issues",   String(report.stats.total)],
    ["Open",           String(report.stats.open)],
    ["Close Rate",     `${report.stats.close_rate}%`],
    ["Duplicate Rate", `${report.stats.duplicate_rate}%`],
    ["Stale >30d",     String(report.stats.stale["30d"])],
    ["Stale >60d",     String(report.stats.stale["60d"])],
    ["Stale >90d",     String(report.stats.stale["90d"])],
    ["Security",       String(report.stats.security_count)],
  ];
  const cw4 = CW / 4;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const [lbl, val] = statItems[row * 4 + col];
      const sx = M + col * cw4;
      fillRect(sx, y, cw4 - 2, 14, [249,250,251], 2);
      sf(7, false, [156,163,175]); doc.text(lbl, sx + 3, y + 5);
      sf(11, true, [17,24,39]);   doc.text(val, sx + 3, y + 11);
    }
    y += 17;
  }
  y += 2;

  // ── Risk Areas + Issue Types
  need(50); rule(y); y += 5;
  const hw = (CW - 8) / 2;
  sf(8, true, [107,114,128]);
  doc.text("RISK AREAS", M, y);
  doc.text("ISSUE TYPES", M + hw + 8, y);
  y += 4;

  const areaE = Object.entries(report.risk_areas);
  const typeE = Object.entries(report.stats.by_type).sort(([,a],[,b]) => b - a).slice(0, 6);
  const nrows = Math.max(areaE.length, typeE.length);

  for (let i = 0; i < nrows; i++) {
    need(8);
    if (areaE[i]) {
      const [key, val] = areaE[i];
      const bc: [number,number,number] = val >= 70 ? [220,38,38] : val >= 45 ? [234,88,12] : val >= 25 ? [202,138,4] : [22,163,74];
      sf(7, false, [55,65,81]);
      doc.text(AREA_LABELS[key] ?? key, M, y + 4);
      // background track
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(M + 30, y, hw - 40, 4, 1, 1, "F");
      // fill
      fillRect(M + 30, y, (hw - 40) * val / 100, 4, bc, 1);
      sf(7, true, [55,65,81]);
      doc.text(String(val), M + hw - 6, y + 4, { align: "right" });
    }
    if (typeE[i]) {
      const [type, count] = typeE[i];
      const pct = (count / report.stats.total) * 100;
      sf(7, false, [55,65,81]);
      doc.text(type.charAt(0).toUpperCase() + type.slice(1), M + hw + 8, y + 4);
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(M + hw + 38, y, hw - 46, 4, 1, 1, "F");
      doc.setFillColor(99, 102, 241);
      doc.roundedRect(M + hw + 38, y, (hw - 46) * pct / 100, 4, 1, 1, "F");
      sf(7, true, [107,114,128]);
      doc.text(String(count), M + hw + hw, y + 4, { align: "right" });
    }
    y += 8;
  }
  y += 2;

  // ── Keywords
  if (report.stats.top_keywords.length > 0) {
    need(18); rule(y); y += 5;
    sf(8, true, [107,114,128]);
    doc.text("HOT-SPOT KEYWORDS (OPEN ISSUES)", M, y); y += 4;
    let kx = M;
    for (const kw of report.stats.top_keywords) {
      const kw_w = kw.length * 2.2 + 8;
      if (kx + kw_w > PW - M) { kx = M; y += 7; }
      fillRect(kx, y - 3, kw_w, 6, [238,242,255], 3);
      sf(7, true, [67,56,202]);
      doc.text(kw, kx + kw_w / 2, y + 1, { align: "center" });
      kx += kw_w + 3;
    }
    y += 10;
  }

  // ── Top Risks
  need(30); rule(y); y += 5;
  sf(8, true, [107,114,128]);
  doc.text("TOP RISKS", M, y); y += 5;

  for (const risk of report.top_risks) {
    const descLines = doc.splitTextToSize(risk.description, CW - 8);
    const mitLines  = doc.splitTextToSize(risk.mitigation, CW - 14);
    const bh = 7 + descLines.length * 4 + mitLines.length * 4 + 10;
    need(bh);
    fillRect(M, y, CW, bh, [249,250,251], 3);
    sf(8, true, [17,24,39]);
    doc.text(risk.title, M + 3, y + 6);
    const sc = SEVERITY_RGB[risk.severity] ?? [107,114,128];
    const scBg: [number,number,number] = sc.map(c => Math.min(c + 170, 248)) as [number,number,number];
    fillRect(PW - M - 22, y + 2, 20, 5, scBg, 2);
    sf(6, true, sc);
    doc.text(risk.severity.toUpperCase(), PW - M - 12, y + 6, { align: "center" });
    sf(7, false, [107,114,128]);
    doc.text(descLines, M + 3, y + 11);
    const ad = y + 11 + descLines.length * 4 + 2;
    fillRect(M + 3, ad, CW - 6, mitLines.length * 4 + 6, [236,253,245], 2);
    sf(6, true, [5,150,105]);
    doc.text("MITIGATION", M + 6, ad + 4);
    sf(7, false, [6,95,70]);
    doc.text(mitLines, M + 6, ad + 8);
    y += bh + 3;
  }

  // ── Recommendations
  need(20); rule(y); y += 5;
  sf(8, true, [107,114,128]);
  doc.text("RECOMMENDATIONS FOR FUTURE PROJECTS", M, y); y += 5;

  report.recommendations.forEach((rec, i) => {
    const lines = doc.splitTextToSize(rec, CW - 14);
    need(lines.length * 4 + 6);
    fillRect(M, y - 3, 7, 7, [238,242,255], 3);
    sf(7, true, [79,70,229]);
    doc.text(String(i + 1), M + 3.5, y + 2, { align: "center" });
    sf(7, false, [55,65,81]);
    doc.text(lines, M + 10, y + 1);
    y += lines.length * 4 + 5;
  });

  // ── Footer
  rule(y + 4);
  sf(7, false, [156,163,175]);
  doc.text("Generated by Git IntelliSolve • AI-powered GitHub Issue Analysis", PW / 2, y + 9, { align: "center" });

  doc.save(`risk-report-${owner}-${repo}.pdf`);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RiskReportModal({ owner, repo }: Props) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<RiskReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    if (report) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRiskReport(owner, repo);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      await downloadPDF(report, owner, repo);
    } finally {
      setDownloading(false);
    }
  };

  const lvl = report ? RISK_LEVEL_STYLE[report.risk_level] ?? RISK_LEVEL_STYLE.Low : null;

  return (
    <>
      <button
        onClick={handleOpen}
        title="Generate risk assessment report"
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span>🛡️</span> Risk Report
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">🛡️ Risk Assessment Report</h2>
                <p className="text-xs text-zinc-400 mt-0.5">{owner}/{repo}</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white">✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {loading && (
                <div className="flex flex-col items-center gap-4 py-16">
                  <svg className="h-10 w-10 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm text-zinc-400">Analyzing issue history and generating risk assessment…</p>
                </div>
              )}
              {error && !loading && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">⚠️ {error}</div>
              )}
              {report && !loading && (
                <>
                  {/* Score banner */}
                  <div className={`rounded-2xl border-2 ${lvl!.border} bg-white dark:bg-zinc-800/50 px-6 py-5 flex items-center gap-6`}>
                    <div className="relative shrink-0 flex items-center justify-center">
                      <svg width="88" height="88" viewBox="0 0 88 88">
                        <circle cx="44" cy="44" r="38" fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-200 dark:text-zinc-700" />
                        <circle cx="44" cy="44" r="38" fill="none" strokeWidth="6"
                          strokeDasharray={`${2 * Math.PI * 38}`}
                          strokeDashoffset={`${2 * Math.PI * 38 * (1 - report.risk_score / 100)}`}
                          strokeLinecap="round"
                          className={report.risk_score >= 75 ? "text-red-500" : report.risk_score >= 50 ? "text-orange-500" : report.risk_score >= 25 ? "text-yellow-500" : "text-emerald-500"}
                          stroke="currentColor" transform="rotate(-90 44 44)" />
                      </svg>
                      <span className="absolute text-2xl font-bold text-zinc-900 dark:text-white">{report.risk_score}</span>
                    </div>
                    <div>
                      <span className={`inline-block rounded-full px-3 py-1 text-sm font-bold ${SEVERITY_STYLE[report.risk_level]}`}>{report.risk_level} Risk</span>
                      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{report.executive_summary}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Total Issues" value={report.stats.total} />
                    <StatCard label="Open" value={report.stats.open} sub={`${100 - report.stats.close_rate}% unresolved`} />
                    <StatCard label="Close Rate" value={`${report.stats.close_rate}%`} />
                    <StatCard label="Duplicate Rate" value={`${report.stats.duplicate_rate}%`} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="Stale >30d" value={report.stats.stale["30d"]} sub="open issues" />
                    <StatCard label="Stale >60d" value={report.stats.stale["60d"]} />
                    <StatCard label="Stale >90d" value={report.stats.stale["90d"]} />
                    <StatCard label="Security Issues" value={report.stats.security_count} />
                  </div>

                  {/* Risk areas + types */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Risk Areas</p>
                      <div className="space-y-2.5">
                        {Object.entries(report.risk_areas).map(([key, val]) => (
                          <div key={key}>
                            <span className="text-xs text-zinc-600 dark:text-zinc-300">{AREA_LABELS[key] ?? key}</span>
                            <MiniBar value={val} color={val >= 70 ? "bg-red-500" : val >= 45 ? "bg-orange-500" : val >= 25 ? "bg-yellow-500" : "bg-emerald-500"} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Issue Types</p>
                      <div className="space-y-2">
                        {Object.entries(report.stats.by_type).sort(([, a], [, b]) => b - a).map(([type, count]) => (
                          <div key={type} className="flex items-center gap-2">
                            <span className="w-24 text-xs capitalize text-zinc-600 dark:text-zinc-300 truncate">{type}</span>
                            <div className="flex-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                              <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(count / report.stats.total) * 100}%` }} />
                            </div>
                            <span className="text-xs text-zinc-500 w-6 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Keywords */}
                  {report.stats.top_keywords.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">🔥 Hot-spot Keywords</p>
                      <div className="flex flex-wrap gap-2">
                        {report.stats.top_keywords.map((kw) => (
                          <span key={kw} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top risks */}
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">⚠️ Top Risks</p>
                    <div className="space-y-3">
                      {report.top_risks.map((risk, i) => (
                        <div key={i} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{risk.title}</p>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${SEVERITY_STYLE[risk.severity]}`}>{risk.severity}</span>
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{risk.description}</p>
                          <div className="mt-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-0.5">Mitigation</p>
                            <p className="text-xs text-emerald-800 dark:text-emerald-200">{risk.mitigation}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">✅ Recommendations for Future Projects</p>
                    <ul className="space-y-2">
                      {report.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">{i + 1}</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {report && (
              <div className="shrink-0 flex items-center gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
                <button
                  onClick={() => { setReport(null); handleOpen(); }}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  🔄 Regenerate
                </button>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {downloading ? (
                    <>
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Building PDF…
                    </>
                  ) : "⬇ Download PDF"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
