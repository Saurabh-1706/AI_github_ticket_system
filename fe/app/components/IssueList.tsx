import IssueCard from "./IssueCard";

export default function IssueList({ issues }: any) {
  return (
    <div className="mt-6 grid gap-4">
      {issues.map((issue: any) => (
        <IssueCard key={issue.id} issue={issue} />
      ))}
    </div>
  );
}
