"use client";

import { useState, useEffect } from "react";
import {
  fetchMilestones,
  generateReleaseNotes,
  type Milestone,
  type ReleaseNotes,
} from "../services/github";

interface Props {
  owner: string;
  repo: string;
  userToken?: string;
}

export default function ReleaseNotesModal({ owner, repo, userToken }: Props) {
  const [open, setOpen] = useState(false);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [milestonesError, setMilestonesError] = useState<string | null>(null);
  const [selectedMs, setSelectedMs] = useState<number | null>(null);
  const [notes, setNotes] = useState<ReleaseNotes | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Load milestones when dialog opens
  useEffect(() => {
    if (!open || milestones.length > 0) return;
    setMilestonesLoading(true);
    setMilestonesError(null);
    fetchMilestones(owner, repo, userToken)
      .then((d) => setMilestones(d.milestones))
      .catch(() => setMilestonesError("Could not load milestones for this repository."))
      .finally(() => setMilestonesLoading(false));
  }, [open, owner, repo, userToken]);

  const handleGenerate = async () => {
    if (selectedMs === null) return;
    setGenerating(true);
    setGenError(null);
    setNotes(null);
    try {
      const result = await generateReleaseNotes(owner, repo, selectedMs, userToken);
      setNotes(result);
    } catch {
      setGenError("Failed to generate release notes. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!notes) return;
    navigator.clipboard.writeText(notes.raw_markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!notes) return;
    const blob = new Blob([notes.raw_markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `release-notes-${notes.version.replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SECTION_COLORS: Record<string, string> = {
    "Bug Fixes":    "text-red-600 dark:text-red-400",
    "Features":     "text-blue-600 dark:text-blue-400",
    "Improvements": "text-emerald-600 dark:text-emerald-400",
    "Other":        "text-zinc-500 dark:text-zinc-400",
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Generate AI release notes"
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span>📋</span> Release Notes
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
                  📋 AI Release Notes Generator
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Select a milestone to generate structured release notes
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Milestone selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Milestone
                </label>
                {milestonesLoading && (
                  <p className="text-sm text-zinc-400">Loading milestones…</p>
                )}
                {milestonesError && (
                  <p className="text-sm text-red-500">{milestonesError}</p>
                )}
                {!milestonesLoading && !milestonesError && milestones.length === 0 && (
                  <p className="text-sm text-zinc-400">No milestones found for this repository.</p>
                )}
                {milestones.length > 0 && (
                  <select
                    value={selectedMs ?? ""}
                    onChange={(e) => {
                      setSelectedMs(Number(e.target.value));
                      setNotes(null);
                      setGenError(null);
                    }}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">— Select a milestone —</option>
                    {milestones.map((m) => (
                      <option key={m.number} value={m.number}>
                        {m.title} ({m.closed_issues} closed issues)
                        {m.state === "open" ? " • Open" : " • Closed"}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Generate button */}
              {selectedMs !== null && !notes && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 active:scale-95 transition-all"
                >
                  {generating ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating…
                    </>
                  ) : "✨ Generate Release Notes"}
                </button>
              )}

              {genError && (
                <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                  ⚠️ {genError}
                </p>
              )}

              {/* Results */}
              {notes && (
                <div className="space-y-4">
                  {/* Summary banner */}
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                      {notes.version}
                    </p>
                    <p className="mt-1 text-sm text-indigo-900 dark:text-indigo-100">{notes.summary}</p>
                  </div>

                  {/* Sections */}
                  {Object.entries(notes.sections).map(([section, items]) =>
                    items.length > 0 ? (
                      <div key={section}>
                        <h3 className={`mb-1.5 text-xs font-bold uppercase tracking-wide ${SECTION_COLORS[section] ?? "text-zinc-600 dark:text-zinc-400"}`}>
                          {section === "Bug Fixes" ? "🐛" : section === "Features" ? "✨" : section === "Improvements" ? "⚡" : "📌"}{" "}
                          {section}
                        </h3>
                        <ul className="space-y-1 pl-4">
                          {items.map((item, i) => (
                            <li key={i} className="text-sm text-zinc-800 dark:text-zinc-200 list-disc">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null
                  )}

                  {/* Raw markdown */}
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                      Raw Markdown
                    </p>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 whitespace-pre-wrap">
                      {notes.raw_markdown}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            {notes && (
              <div className="flex items-center gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 transition-colors"
                >
                  {copied ? "✓ Copied!" : "📋 Copy Markdown"}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
                >
                  ⬇ Download .md
                </button>
                <button
                  onClick={() => { setNotes(null); setSelectedMs(null); }}
                  className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  Start over
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
