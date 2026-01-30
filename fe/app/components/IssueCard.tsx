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
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: any) {
  return (
    <div>
      <p className="text-slate-400">{label}</p>
      <p className="font-medium capitalize">{value}</p>
    </div>
  );
}
