<<<<<<< HEAD
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
        <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
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
        <Info label="Type" value={issue?.ai_analysis?.type ?? "unknown"} />
        <Info
          label="Criticality"
          value={issue?.ai_analysis?.criticality ?? "unknown"}
        />
        <Info
          label="Similarity"
          value={
            typeof dup.similarity === "number"
              ? `${Math.round(dup.similarity * 100)}%`
              : "N/A"
          }
        />
        <Info label="Reuse" value={dup.reuse_type ?? "—"} />
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
=======
import AnalysisBadge from "./AnalysisBadge";
import ConfidenceBar from "./ConfidenceBar";
import DuplicateBadge from "./DuplicateBadge";
import SimilarIssueCard from "./SimilarIssueCard";

interface IssueCardProps {
  issue: any;
}

export default function IssueCard({ issue }: any) {
  const dup = issue.duplicate_info;

  const badgeColor =
    dup?.classification === "duplicate"
      ? "bg-red-100 text-red-700"
      : dup?.classification === "related"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-green-100 text-green-700";

  return (
    <div className="bg-white border rounded-xl p-5 hover:shadow transition">
      <div className="flex justify-between items-start">
        <h3 className="font-medium text-lg">{issue.title}</h3>

        <span className={`px-2 py-1 text-xs rounded ${badgeColor}`}>
          {dup?.classification ?? "new"}
        </span>
      </div>

      <p className="text-sm text-slate-600 mt-2 line-clamp-2">{issue.body}</p>

      {/* AI Section */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <Info label="Type" value={issue.ai_analysis.type} />
        <Info label="Criticality" value={issue.ai_analysis.criticality} />
        <Info
          label="Similarity"
          value={`${Math.round(dup.similarity * 100)}%`}
        />
        <Info label="Reuse" value={dup.reuse_type} />
      </div>

      {dup?.similar_issue && (
        <div className="mt-3 text-xs text-slate-500">
          🔁 Similar to:{" "}
          <span className="font-medium">{dup.similar_issue.title}</span>
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
        </div>
      )}
    </div>
  );
}

<<<<<<< HEAD
/* ---------- Small reusable info block ---------- */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-0.5 font-medium capitalize text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
=======
function Info({ label, value }: any) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="font-medium capitalize">{value}</p>
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
    </div>
  );
}
