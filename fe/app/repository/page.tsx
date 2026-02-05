"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchRepo, fetchIssues } from "../services/github";
import RepoCard from "../components/RepoCard";
import IssueList from "../components/IssueList";
import IssueDetail from "../components/IssueDetail";

export default function RepositoryPage() {
  const params = useSearchParams();
  const owner = params.get("owner");
  const repo = params.get("repo");

  const [repoData, setRepoData] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<any>(null);

  useEffect(() => {
    if (!owner || !repo) return;

    const loadData = async () => {
      try {
        const [repoRes, issuesRes] = await Promise.all([
          fetchRepo(owner, repo),
          fetchIssues(owner, repo),
        ]);

        setRepoData(repoRes);
        setIssues(issuesRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [owner, repo]);

  useEffect(() => {
    console.log("selectedIssue =", selectedIssue);
  }, [selectedIssue]);


  const handleSelectSimilar = (similar: any) => {
    const match = issues.find((i) => i.number === similar.number);
    if (match) setSelectedIssue(match);
  };

  if (loading) {
    return <div className="p-10 text-center">Loading…</div>;
  }

  const handleSelectIssue = async (issue: any) => {
    setSelectedIssue(issue); // open panel immediately
  
    try {
      const analysis = await fetch(
        "http://localhost:8000/api/analysis/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(issue),
        }
      ).then((r) => r.json());
  
      setSelectedIssue({
        ...issue,
        ai_analysis: {
          type: analysis.type ?? "unknown",
          criticality: analysis.criticality ?? "unknown",
          confidence: analysis.confidence ?? 0,
        },
        duplicate_info: analysis.similar_issues?.[0] ?? null,
        similar_issues: analysis.similar_issues ?? [],
      });
    } catch (e) {
      console.error("Analysis failed", e);
    }
  };
  

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="relative flex h-[calc(100vh-64px)] overflow-hidden">
          {/* LEFT: ISSUE LIST */}
          <div
            className={`
              transition-all duration-300
              ${selectedIssue ? "hidden md:block md:w-1/2 lg:w-3/5" : "w-full"}
              overflow-y-auto no-scrollbar pr-2
            `}
          >

            <RepoCard repo={repoData} />
            <IssueList
              issues={issues}
              onSelect={handleSelectIssue}
              onSelectSimilar={handleSelectSimilar}
            />
          </div>

          {/* RIGHT: ISSUE DETAIL PANEL */}
          <div
            className={`
              fixed inset-y-0 right-0 z-40
              w-full md:w-1/2 lg:w-2/5
              bg-white dark:bg-zinc-900
              border-l border-zinc-200 dark:border-zinc-800
              transform transition-transform duration-300 ease-in-out
              ${selectedIssue ? "translate-x-0" : "translate-x-full"}
            `}
          >
            {selectedIssue && (
              <IssueDetail
                issue={selectedIssue}
                onClose={() => setSelectedIssue(null)}
                onSelectSimilar={handleSelectSimilar}
              />
            )}
          </div>

        </div>

      </main>

    </div>
  );
}

/* ✅ MUST BE BELOW (same file) */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
