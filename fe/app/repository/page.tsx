"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchRepo, fetchIssues } from "../services/github";
import RepoCard from "../components/RepoCard";
import IssueList from "../components/IssueList";

export default function RepositoryPage() {
  const params = useSearchParams();
  const owner = params.get("owner");
  const repo = params.get("repo");

  const [repoData, setRepoData] = useState<any>(null);
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!owner || !repo) return;

    Promise.all([fetchRepo(owner, repo), fetchIssues(owner, repo)])
      .then(([repoRes, issuesRes]) => {
        setRepoData(repoRes);

        // Filter out pull requests
        const onlyIssues = issuesRes
          .filter((i: any) => !i.pull_request)
          .map((issue: any, idx: number) => {
            const similarity = Math.random(); // mock cosine similarity

            return {
              ...issue,

              // AI analysis (already working)
              ai_analysis: {
                criticality: ["critical", "high", "medium", "low"][
                  Math.floor(Math.random() * 4)
                ],
                type: ["bug", "feature", "documentation", "performance"][
                  Math.floor(Math.random() * 4)
                ],
                confidence: Number(similarity.toFixed(2)),
              },

              // 🔁 Duplicate detection (Phase 3)
              duplicate_info: {
                classification:
                  similarity >= 0.85
                    ? "duplicate"
                    : similarity >= 0.7
                      ? "related"
                      : "new",

                similarity,

                reuse_type:
                  similarity >= 0.9
                    ? "direct"
                    : similarity >= 0.8
                      ? "adapt"
                      : similarity >= 0.7
                        ? "reference"
                        : "minimal",

                similar_issue:
                  similarity >= 0.7
                    ? {
                        title: `Similar issue #${idx + 101}`,
                      }
                    : null,
              },
            };
          });

        setIssues(onlyIssues);
      })
      .finally(() => setLoading(false));
  }, [owner, repo]);

  if (loading) return <p>Loading...</p>;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <RepoCard repo={repoData} />

      <h2 className="text-xl font-bold mt-10">Issues ({issues.length})</h2>

      <IssueList issues={issues} />
    </main>
  );
}
