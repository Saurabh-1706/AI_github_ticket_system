"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  // 🔒 Hard guard — prevents invisible render
  if (!issue || !issue.number || !issue.title) {
    return (
      <div className="p-6 text-red-500">
        Issue data missing
      </div>
    );
  }

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
                key={typeof label === 'string' ? label : label.id}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {typeof label === 'string' ? label : label.name}
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
                  issue.ai_analysis.confidence
                    ? `${Math.round(issue.ai_analysis.confidence * 100)}%`
                    : "—"
                }
              />
            </div>
          </div>
        )}

        {/* ================= AI SOLUTION ================= */}
        {issue.solution && (
          <div className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                🛠️ Suggested Solution
              </h3>

              <SolutionConfidenceBadge confidence={issue.solution.confidence} />
            </div>

            {/* Summary */}
            <p className="mb-4 text-sm text-indigo-900 dark:text-indigo-100">
              {issue.solution.summary}
            </p>

            {/* Steps */}
            {issue.solution.steps?.length > 0 && (
              <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
                {issue.solution.steps.map((step: string, i: number) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}

            {/* Code Snippets */}
            {issue.solution.code?.length > 0 && (
              <div className="space-y-3">
                {issue.solution.code.map((snippet: string, i: number) => (
                  <pre
                    key={i}
                    className="overflow-x-auto rounded-lg bg-black p-3 text-xs text-green-400"
                  >
                    <code>{snippet}</code>
                  </pre>
                ))}
              </div>
            )}

            {/* References */}
            {issue.solution.references?.length > 0 && (
              <div className="mt-4 text-xs text-indigo-700 dark:text-indigo-300">
                <strong>References:</strong>
                <ul className="list-disc pl-4">
                  {issue.solution.references.map((ref: string, i: number) => (
                    <li key={i}>{ref}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}


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


function SolutionConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8)
    return <Badge text="High confidence" color="green" />;
  if (confidence >= 0.6)
    return <Badge text="Medium confidence" color="yellow" />;
  return <Badge text="Low confidence" color="red" />;
}

function Badge({ text, color }: { text: string; color: string }) {
  const map: any = {
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[color]}`}>
      {text}
    </span>
  );
}
