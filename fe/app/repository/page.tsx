"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchRepo, fetchIssues } from "../services/github";
import RepoCard from "../components/RepoCard";
import IssueList from "../components/IssueList";
import { analyzeIssue } from "../services/github";

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

        // ✅ Only real GitHub issues
        const cleanIssues = issuesRes.issues.filter(
          (i: any) => !i.pull_request,
        );

        // ✅ REAL AI + VECTOR ANALYSIS
        const enrichedIssues = await Promise.all(
          cleanIssues.map(async (issue: any) => {
            const analysis = await analyzeIssue(issue);

            return {
              ...issue,
              ai_analysis: {
                type: analysis.type,
                criticality: analysis.criticality,
                confidence: analysis.confidence,
              },
              duplicate_info: analysis.similar_issues?.[0] ?? {
                classification: "new",
                similarity: 0,
                reuse_type: "minimal",
              },
              similar_issues: analysis.similar_issues ?? [],
            };
          }),
        );

        setIssues(enrichedIssues);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [owner, repo]);

  const handleSelectSimilar = (similar: any) => {
    const match = issues.find((i) => i.title === similar.title);

    if (match) {
      setSelectedIssue(match);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center text-zinc-600 dark:text-zinc-400">
        Loading repository…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* ✅ Navbar */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Git IntelliSolve
          </h1>

          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            AI-powered issue intelligence
          </span>
        </div>
      </header>

      {/* ✅ Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-10 space-y-10">
        <RepoCard repo={repoData} />

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Issues
          </h2>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {issues.length} total
          </span>
        </div>

        <IssueList
          issues={issues}
          onSelect={setSelectedIssue}
          onSelectSimilar={handleSelectSimilar}
        />

        {selectedIssue && (
          <div className="fixed inset-0 z-50 flex">
            {/* Overlay */}
            <div
              className="flex-1 bg-black/40"
              onClick={() => setSelectedIssue(null)}
            />

            {/* Panel */}
            <div className="w-full max-w-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-zinc-400">
                    Issue #{selectedIssue.number}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {selectedIssue.title}
                  </h2>
                </div>

                <button
                  onClick={() => setSelectedIssue(null)}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              {selectedIssue.body && (
                <p className="mt-4 text-sm text-zinc-700 dark:text-zinc-300">
                  {selectedIssue.body}
                </p>
              )}

              {/* AI Analysis */}
              <div className="mt-6 space-y-3 text-sm">
                <div>
                  <span className="text-zinc-400">Type:</span>{" "}
                  <span className="font-medium capitalize">
                    {selectedIssue?.ai_analysis?.type ?? "unknown"}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-400">Criticality:</span>{" "}
                  <span className="font-medium capitalize">
                    {selectedIssue?.ai_analysis?.criticality ?? "unknown"}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-400">Confidence:</span>{" "}
                  <span className="font-medium">
                    {selectedIssue?.ai_analysis?.confidence
                      ? `${Math.round(selectedIssue.ai_analysis.confidence * 100)}%`
                      : "N/A"}
                  </span>
                </div>

                <div>
                  <span className="text-zinc-400">Reuse:</span>{" "}
                  {selectedIssue.duplicate_info.reuse_type}
                </div>
              </div>

              {/* Placeholder for Phase 4 */}
              <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
                🤖 AI Solution will appear here
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
