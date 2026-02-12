"use client";

interface IssueCardProps {
  issue: any;
  onSelect: (issue: any) => void;
  onSelectSimilar?: (issue: any) => void;
}

export default function IssueCard({
  issue,
  onSelect,
  onSelectSimilar,
}: IssueCardProps) {
  const dup = issue?.duplicate_info ?? {};

  const getTypeColor = (type?: string) => {
    switch (type?.toLowerCase()) {
      case "bug": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "feature": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "documentation": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "question": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "enhancement": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      default: return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    }
  };

  const classificationStyle =
    dup.classification === "duplicate"
      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      : dup.classification === "related"
        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";

  return (
    <div
      onClick={() => onSelect(issue)}
      className="group cursor-pointer rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h3 className="line-clamp-1 text-lg font-medium text-zinc-900 dark:text-zinc-100">
          #{issue?.number ?? "—"} {issue?.title ?? "Untitled issue"}
        </h3>

        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize ${classificationStyle}`}
        >
          {dup.classification ?? "new"}
        </span>
      </div>

      {/* Body */}
      {issue?.body && (
        <p className="mt-3 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
          {issue.body}
        </p>
      )}

      {/* AI Metadata */}
      <div className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-400">Type</p>
          {issue?.ai_analysis?.type ? (
            <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getTypeColor(issue.ai_analysis.type)}`}>
              {issue.ai_analysis.type}
            </span>
          ) : (
            <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">unknown</p>
          )}
        </div>
        <Info
          label="Criticality"
          value={issue?.ai_analysis?.criticality ?? "unknown"}
        />
        <Info
          label="Confidence"
          value={
            issue?.ai_analysis?.confidence !== undefined
              ? `${Math.round(issue.ai_analysis.confidence * 100)}%`
              : "N/A"
          }
        />
        <Info
          label="Similarity"
          value={
            typeof dup.similarity === "number"
              ? `${Math.round(dup.similarity * 100)}%`
              : "N/A"
          }
        />
      </div>

      {/* 🔁 MULTIPLE SIMILAR ISSUES (THIS IS THE PART YOU ASKED ABOUT) */}
      {issue.similar_issues?.length > 0 && (
        <div className="mt-4 space-y-2">
          {issue.similar_issues.map((s: any) => (
            <button
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectSimilar?.(s);
              }}
              className="w-full rounded-lg bg-zinc-50 p-2 text-left text-xs hover:bg-zinc-100 dark:bg-zinc-800"
            >
              🔁 #{s.number} {s.title}
              <span className="ml-2 text-zinc-500">
                ({Math.round(s.similarity * 100)}%)
              </span>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}

/* ---------- Small reusable info block ---------- */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-0.5 font-medium capitalize text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}
