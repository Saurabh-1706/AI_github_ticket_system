<<<<<<< HEAD
"use client";

import IssueCard from "./IssueCard";

interface IssueListProps {
  issues: any[];
  onSelect: (issue: any) => void;
  onSelectSimilar?: (issue: any) => void;
}

export default function IssueList({
  issues,
  onSelect,
  onSelectSimilar,
}: IssueListProps) {
  if (!issues || issues.length === 0) {
    return (
      <div className="mt-10 rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        No issues found.
      </div>
    );
  }

  return (
    <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {issues.map((issue) => (
        <IssueCard
          key={issue.id ?? issue.number}
          issue={issue}             
          onSelect={onSelect}
          onSelectSimilar={onSelectSimilar}
        />
=======
import IssueCard from "./IssueCard";

export default function IssueList({ issues }: any) {
  return (
    <div className="mt-6 grid gap-4">
      {issues.map((issue: any) => (
        <IssueCard key={issue.id} issue={issue} />
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
      ))}
    </div>
  );
}
