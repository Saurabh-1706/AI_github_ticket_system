"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { generateSolution, type GeneratedSolution } from "../services/github";

interface IssueDetailProps {
  issue: any;
  onClose: () => void;
  onSelectSimilar: (issue: any) => void;
}

export default function IssueDetail({
  issue,
  onClose,
  onSelectSimilar,
}: IssueDetailProps) {
  const [solution, setSolution] = useState<GeneratedSolution | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [wasCached, setWasCached] = useState(false);

  // 🔒 Hard guard — prevents invisible render
  if (!issue || !issue.number || !issue.title) {
    return (
      <div className="p-6 text-red-500">
        Issue data missing
      </div>
    );
  }

  const handleGenerateSolution = async () => {
    setGenerating(true);
    setGenError(null);

    // Extract owner/repo from issue data or fall back to URL params
    const owner = issue.owner || new URLSearchParams(window.location.search).get("owner") || "";
    const repo = issue.repo || new URLSearchParams(window.location.search).get("repo") || "";

    try {
      const result = await generateSolution(
        String(issue.id || issue.number),
        issue.title,
        issue.body || "",
        owner,
        repo
      );
      setSolution(result.solution);
      setWasCached(result.cached);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Failed to generate solution.");
    } finally {
      setGenerating(false);
    }
  };

  const getTypeColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case "bug": return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400";
      case "feature": return "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400";
      case "documentation": return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400";
      case "question": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "enhancement": return "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400";
      default: return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">

      {/* ================= HEADER ================= */}
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-3">
          <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            #{issue.number}
          </span>

          <h2 className="flex-1 text-base font-semibold leading-snug break-words">
            {issue.title}
          </h2>

          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ================= SCROLLABLE CONTENT ================= */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-6">

        {/* Issue Body */}
        <div className="prose prose-zinc dark:prose-invert max-w-none break-words leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {issue.body || "No description provided."}
          </ReactMarkdown>
        </div>

        {/* Labels */}
        {issue.labels?.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {issue.labels.map((label: any) => (
              <span
                key={typeof label === "string" ? label : label.id}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {typeof label === "string" ? label : label.name}
              </span>
            ))}
          </div>
        )}

        {/* AI Analysis */}
        {issue.ai_analysis && (
          <div className="mt-8 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 className="mb-3 text-sm font-semibold">
              🤖 AI Analysis
            </h3>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Type</p>
                {issue.ai_analysis.type ? (
                  <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getTypeColor(issue.ai_analysis.type)}`}>
                    {issue.ai_analysis.type}
                  </span>
                ) : (
                  <p className="mt-0.5 font-medium">—</p>
                )}
              </div>
              <Info
                label="Criticality"
                value={issue.ai_analysis.criticality ?? "—"}
              />
              <Info
                label="Confidence"
                value={
                  issue.ai_analysis.confidence != null
                    ? `${Math.round(issue.ai_analysis.confidence * 100)}%`
                    : "—"
                }
              />
            </div>
          </div>
        )}

        {/* ================= AI SOLUTION SECTION ================= */}
        <div className="mt-8">

          {/* Generate Button — shown when no solution yet */}
          {!solution && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    🛠️ AI Solution Generator
                  </h3>
                  <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                    Generate a structured step-by-step solution
                  </p>
                </div>

                <button
                  onClick={handleGenerateSolution}
                  disabled={generating}
                  className={`
                    ml-4 flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold
                    transition-all duration-200
                    ${generating
                      ? "cursor-not-allowed bg-indigo-300 text-white dark:bg-indigo-700"
                      : "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 dark:bg-indigo-500 dark:hover:bg-indigo-600"
                    }
                  `}
                >
                  {generating ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>✨ Generate Solution</>
                  )}
                </button>
              </div>

              {/* Error */}
              {genError && (
                <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  ⚠️ {genError}
                </p>
              )}
            </div>
          )}

          {/* Generated Solution Display */}
          {solution && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">

              {/* Header row */}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                  🛠️ Suggested Solution
                </h3>
                <div className="flex items-center gap-2">
                  {wasCached && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      ⚡ Cached
                    </span>
                  )}
                  <span className="rounded-full bg-indigo-200 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-800 dark:text-indigo-300">
                    {solution.is_code_fix ? "💻 Code Fix" : "📋 Guidance"}
                  </span>
                  {/* Regenerate button */}
                  <button
                    onClick={() => { setSolution(null); setGenError(null); }}
                    className="rounded-full px-2 py-0.5 text-xs text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900"
                    title="Regenerate solution"
                  >
                    ↩ Reset
                  </button>
                </div>
              </div>

              {/* Summary */}
              <p className="mb-4 text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">
                {solution.summary}
              </p>

              {/* Steps */}
              {solution.steps?.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                    Steps to Resolve
                  </p>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-indigo-900 dark:text-indigo-100">
                    {solution.steps.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Code Snippet — only for code fixes */}
              {solution.is_code_fix && solution.code && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                    Code Change
                    {solution.code_language && (
                      <span className="ml-2 rounded bg-indigo-200 px-1.5 py-0.5 text-indigo-700 normal-case dark:bg-indigo-800 dark:text-indigo-300">
                        {solution.code_language}
                      </span>
                    )}
                  </p>
                  {solution.code_explanation && (
                    <p className="mb-2 text-xs text-indigo-700 dark:text-indigo-300 italic">
                      {solution.code_explanation}
                    </p>
                  )}
                  <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs text-green-400 dark:bg-black">
                    <code>{solution.code}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>


        {/* Similar Issues */}
        {issue.similar_issues?.length > 0 && (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-semibold">
              🔁 Similar Issues
            </h3>

            <ul className="space-y-2">
              {issue.similar_issues.map((s: any) => (
                <li
                  key={s.id}
                  onClick={() => onSelectSimilar(s)}
                  className="cursor-pointer rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                >
                  #{s.number} {s.title}
                  <span className="ml-2 text-zinc-500">
                    ({Math.round(s.similarity * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= INFO BLOCK ================= */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 font-medium capitalize">
        {value}
      </p>
    </div>
  );
}
