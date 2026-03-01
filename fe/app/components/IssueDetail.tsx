"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  generateSolution,
  deleteSolution,
  fetchIssueComments,
  fetchLinkedPRs,
  fetchPriorityScore,
  fetchSuggestedLabels,
  fetchSimilarIssues,
  fetchCachedIssueDetail,
  checkSolutionExists,
  postIssueComment,
  fetchSuggestedAssignees,
  type GeneratedSolution,
  type IssueComment,
  type LinkedPR,
  type PriorityScore,
  type LabelSuggestion,
  type SimilarIssue,
  type CachedSolution,
  type SuggestedAssignee,
} from "../services/github";

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
  const [regenerating, setRegenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [wasCached, setWasCached] = useState(false);

  // single active-tab: 'comments' | 'linked-prs' | null
  const [activeTab, setActiveTab] = useState<"comments" | "linked-prs" | "similar-issues" | null>(null);
  const [comments, setComments] = useState<IssueComment[] | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [linkedPRs, setLinkedPRs] = useState<LinkedPR[] | null>(null);
  const [linkedPRsLoading, setLinkedPRsLoading] = useState(false);

  // Similar Issues
  const [similarIssues, setSimilarIssues] = useState<SimilarIssue[] | null>(null);
  const [similarIssuesLoading, setSimilarIssuesLoading] = useState(false);

  // Inline expanded similar issue preview
  const [expandedSimilarNum, setExpandedSimilarNum] = useState<number | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<any>(null);
  const [expandedSolution, setExpandedSolution] = useState<{ exists: boolean; solution: CachedSolution | null } | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  // toggle showing the full solution inside an expanded preview
  const [showSolutionNum, setShowSolutionNum] = useState<number | null>(null);

  // Priority score
  const [priority, setPriority] = useState<PriorityScore | null>(null);

  // Suggested assignees
  const [assignees, setAssignees] = useState<SuggestedAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  // Label suggestions
  const [labels, setLabels] = useState<LabelSuggestion | null>(null);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [labelsCopied, setLabelsCopied] = useState(false);

  // Comment compose
  const [replyTarget, setReplyTarget] = useState<IssueComment | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const getOwnerRepo = () => ({
    owner: issue.owner || new URLSearchParams(window.location.search).get("owner") || "",
    repo:  issue.repo  || new URLSearchParams(window.location.search).get("repo")  || "",
  });

  const handleTabClick = (tab: "comments" | "linked-prs" | "similar-issues") => {
    // toggle off if already active
    if (activeTab === tab) { setActiveTab(null); return; }
    setActiveTab(tab);
    if (tab === "comments" && comments === null) {
      const { owner, repo } = getOwnerRepo();
      setCommentsLoading(true);
      fetchIssueComments(owner, repo, issue.number)
        .then(d => setComments(d.comments))
        .catch(() => setComments([]))
        .finally(() => setCommentsLoading(false));
    }
    if (tab === "linked-prs" && linkedPRs === null) {
      const { owner, repo } = getOwnerRepo();
      setLinkedPRsLoading(true);
      fetchLinkedPRs(owner, repo, issue.number)
        .then(d => setLinkedPRs(d.linked_prs))
        .catch(() => setLinkedPRs([]))
        .finally(() => setLinkedPRsLoading(false));
    }
    if (tab === "similar-issues" && similarIssues === null) {
      const { owner, repo } = getOwnerRepo();
      setSimilarIssuesLoading(true);
      fetchSimilarIssues(owner, repo, issue.number)
        .then(d => setSimilarIssues(d.similar_issues))
        .catch(() => setSimilarIssues([]))
        .finally(() => setSimilarIssuesLoading(false));
    }
  };

  // Reset ALL stale data when switching to a different issue
  useEffect(() => {
    // Solution state — must clear so previous issue's solution isn't shown
    setSolution(null);
    setGenerating(false);
    setRegenerating(false);
    setGenError(null);
    setWasCached(false);
    // Tab / panel data
    setActiveTab(null);
    setComments(null);
    setLinkedPRs(null);
    setSimilarIssues(null);
    setExpandedSimilarNum(null);
    setExpandedDetail(null);
    setExpandedSolution(null);
    setShowSolutionNum(null);
    setPriority(null);
    setAssignees([]);
    setLabels(null);
    setLabelsCopied(false);
    setReplyTarget(null);
    setCommentDraft("");
    setCommentError(null);
  }, [issue?.number, issue?.owner, issue?.repo]);

  const handlePostComment = async () => {
    const authToken =
      typeof window !== "undefined" ? localStorage.getItem("auth_token") ?? undefined : undefined;
    if (!authToken) { setCommentError("Sign in with GitHub to post comments."); return; }
    if (!commentDraft.trim()) { setCommentError("Comment cannot be empty."); return; }
    const { owner, repo } = getOwnerRepo();
    setCommentPosting(true);
    setCommentError(null);
    try {
      const posted = await postIssueComment(
        owner, repo, issue.number,
        commentDraft.trim(),
        authToken,
        replyTarget ? { author: replyTarget.author, body: replyTarget.body } : undefined
      );
      // Optimistic update — append to comment list immediately
      setComments((prev) => [
        ...(prev ?? []),
        { id: posted.id, author: posted.author, avatar_url: posted.avatar_url,
          body: posted.body, created_at: posted.created_at, updated_at: posted.updated_at },
      ]);
      setCommentDraft("");
      setReplyTarget(null);
    } catch (e) {
      setCommentError(e instanceof Error ? e.message : "Failed to post comment.");
    } finally {
      setCommentPosting(false);
    }
  };

  // Auto-fetch priority score + suggested assignees whenever issue changes
  useEffect(() => {
    if (!issue?.number) return;
    const { owner, repo } = {
      owner: issue.owner || new URLSearchParams(window.location.search).get("owner") || "",
      repo:  issue.repo  || new URLSearchParams(window.location.search).get("repo")  || "",
    };
    if (!owner || !repo) return;
    fetchPriorityScore(owner, repo, issue.number)
      .then(setPriority)
      .catch(() => setPriority(null));
    // Suggested assignees
    setAssigneesLoading(true);
    const userToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") ?? undefined : undefined;
    fetchSuggestedAssignees(owner, repo, issue.number, userToken ?? undefined)
      .then((d) => setAssignees(d.assignees))
      .catch(() => setAssignees([]))
      .finally(() => setAssigneesLoading(false));
  }, [issue?.number, issue?.owner, issue?.repo]);

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

  /** Clear MongoDB cache and immediately regenerate a fresh solution. */
  const handleRegenerate = async () => {
    const issueId = String(issue.id || issue.number);
    setRegenerating(true);
    setGenError(null);
    setSolution(null);
    try {
      await deleteSolution(issueId);
    } catch {
      // Ignore — it's fine if there was nothing to delete
    } finally {
      setRegenerating(false);
    }
    // Immediately generate fresh solution
    await handleGenerateSolution();
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

              {/* Priority score – auto-fetched */}
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Priority</p>
                {priority ? (
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    priority.label.startsWith("P0") ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400" :
                    priority.label.startsWith("P1") ? "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400" :
                    priority.label.startsWith("P2") ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400" :
                    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  }`}>
                    {priority.emoji} {priority.label}
                    <span className="ml-1 opacity-60">{priority.score}</span>
                  </span>
                ) : (
                  <p className="mt-0.5 text-xs text-zinc-400">—</p>
                )}
              </div>
            </div>

            {/* Suggested Assignees */}
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">👤 Suggested Assignees</p>
              {assigneesLoading && (
                <p className="text-xs text-zinc-400">Finding top contributors…</p>
              )}
              {!assigneesLoading && assignees.length === 0 && (
                <p className="text-xs text-zinc-400">No commit data found for related files.</p>
              )}
              {!assigneesLoading && assignees.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {assignees.map((a) => (
                    <a
                      key={a.login}
                      href={a.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                    >
                      {a.avatar_url && (
                        <img src={a.avatar_url} alt={a.login} className="h-4 w-4 rounded-full" />
                      )}
                      <span>{a.login}</span>
                      <span className="rounded-full bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                        {a.commit_count}
                      </span>
                    </a>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[10px] text-zinc-400">Based on recent commits to related files</p>
            </div>

            {/* Label Suggestions */}
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">🏷️ Suggested Labels</p>
                {!labels && (
                  <button
                    onClick={async () => {
                      setLabelsLoading(true);
                      const { owner, repo } = {
                        owner: issue.owner || new URLSearchParams(window.location.search).get("owner") || "",
                        repo:  issue.repo  || new URLSearchParams(window.location.search).get("repo")  || "",
                      };
                      try {
                        const res = await fetchSuggestedLabels(owner, repo, issue.number, issue.title, issue.body || "");
                        setLabels(res);
                      } catch { setLabels({ suggested_labels: [], source: "error" }); }
                      finally { setLabelsLoading(false); }
                    }}
                    disabled={labelsLoading}
                    className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {labelsLoading ? "Loading…" : "Suggest"}
                  </button>
                )}
                {labels && labels.suggested_labels.length > 0 && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(labels.suggested_labels.join(", "));
                      setLabelsCopied(true);
                      setTimeout(() => setLabelsCopied(false), 1500);
                    }}
                    className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {labelsCopied ? "✓ Copied" : "Copy"}
                  </button>
                )}
              </div>
              {labels && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {labels.suggested_labels.length === 0 ? (
                    <p className="text-xs text-zinc-400">No labels suggested</p>
                  ) : labels.suggested_labels.map((lbl) => (
                    <span key={lbl} className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-0.5 text-xs capitalize dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {lbl}
                    </span>
                  ))}
                  <span className="text-xs text-zinc-300 dark:text-zinc-600">via {labels.source}</span>
                </div>
              )}
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
                  {/* Regenerate button — deletes cache and re-runs GPT */}
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating || generating}
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-indigo-500 hover:bg-indigo-100 disabled:opacity-50 dark:hover:bg-indigo-900"
                    title="Delete cached solution and regenerate with fresh code context"
                  >
                    {regenerating ? (
                      <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : "🔄"}
                    {regenerating ? "Clearing…" : "Regenerate"}
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

              {/* Code section — precise diff when available, fallback to generic block */}
              {solution.is_code_fix && (solution.code || solution.code_before) && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
                    Code Change
                    {solution.code_language && (
                      <span className="ml-2 rounded bg-indigo-200 px-1.5 py-0.5 text-indigo-700 normal-case dark:bg-indigo-800 dark:text-indigo-300">
                        {solution.code_language}
                      </span>
                    )}
                  </p>

                  {/* File path */}
                  {solution.file_path && (
                    <div className="flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
                      <span className="text-zinc-400">📁</span>
                      <code className="text-xs font-mono text-zinc-700 dark:text-zinc-200 flex-1">{solution.file_path}</code>
                      {solution.path_confirmed ? (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          ✓ Verified
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          title="This path was suggested by AI and may not exist exactly in the repo. Sync the repo first to enable verified paths.">
                          ⚠️ Estimated
                        </span>
                      )}
                    </div>
                  )}

                  {/* code_explanation as "Where to change" */}
                  {solution.code_explanation && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Where to make changes</p>
                      <p className="text-xs text-zinc-700 dark:text-zinc-300">{solution.code_explanation}</p>
                    </div>
                  )}

                  {/* BEFORE block — only when we have precise diff */}
                  {solution.code_before && (
                    <div className="overflow-hidden rounded-lg border border-red-300 dark:border-red-800">
                      <div className="bg-red-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:bg-red-900/40 dark:text-red-400">
                        ✕ Before — existing code
                      </div>
                      <pre className="overflow-x-auto bg-red-50 p-3 text-xs text-red-900 dark:bg-red-950/30 dark:text-red-200">
                        <code>{solution.code_before}</code>
                      </pre>
                    </div>
                  )}

                  {/* AFTER block — precise replacement or fallback to code */}
                  {(solution.code_after || solution.code) && (
                    <div className="overflow-hidden rounded-lg border border-green-300 dark:border-green-800">
                      <div className="bg-green-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-green-600 dark:bg-green-900/40 dark:text-green-400">
                        ✓ After — {solution.code_before ? "replacement code" : "code to add"}
                      </div>
                      <pre className="overflow-x-auto bg-green-50 p-3 text-xs text-green-900 dark:bg-green-950/30 dark:text-green-200">
                        <code>{solution.code_after || solution.code}</code>
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>




        {/* ── Tab headers: 💬 Comments | 🔗 Linked PRs | 🔁 Similar Issues ─── */}
        <div className="mt-8">

          {/* Header row — three tabs side by side */}
          <div className="grid grid-cols-3 gap-2">
            {/* Comments tab */}
            <button
              onClick={() => handleTabClick("comments")}
              className={`flex items-center justify-between rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                activeTab === "comments"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="flex items-center gap-1.5">
                💬 <span className="hidden sm:inline">Comments</span>
                {comments !== null && (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-500 dark:bg-zinc-800">
                    {comments.length}
                  </span>
                )}
              </span>
              <span className="text-xs opacity-60">{activeTab === "comments" ? "▲" : "▼"}</span>
            </button>

            {/* Linked PRs tab */}
            <button
              onClick={() => handleTabClick("linked-prs")}
              className={`flex items-center justify-between rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                activeTab === "linked-prs"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="flex items-center gap-1.5">
                🔗 <span className="hidden sm:inline">Linked PRs</span>
                {linkedPRs !== null && (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-500 dark:bg-zinc-800">
                    {linkedPRs.length}
                  </span>
                )}
              </span>
              <span className="text-xs opacity-60">{activeTab === "linked-prs" ? "▲" : "▼"}</span>
            </button>

            {/* Similar Issues tab */}
            <button
              onClick={() => handleTabClick("similar-issues")}
              className={`flex items-center justify-between rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                activeTab === "similar-issues"
                  ? "border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
                  : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="flex items-center gap-1.5">
                🔁 <span className="hidden sm:inline">Similar</span>
                {similarIssues !== null && (
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-normal text-zinc-500 dark:bg-zinc-800">
                    {similarIssues.length}
                  </span>
                )}
              </span>
              <span className="text-xs opacity-60">{activeTab === "similar-issues" ? "▲" : "▼"}</span>
            </button>
          </div>

          {/* Full-width content panel — only shows the active tab */}
          {activeTab === "comments" && (
            <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">

              {/* ── Comment list ───────────────────────────── */}
              <div className="max-h-80 space-y-0 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                {commentsLoading && (
                  <p className="px-4 py-3 text-sm text-zinc-400">Loading…</p>
                )}
                {!commentsLoading && comments?.length === 0 && (
                  <p className="px-4 py-3 text-sm text-zinc-400">No comments yet. Be the first to comment!</p>
                )}
                {comments?.map((c) => (
                  <div key={c.id} className="group px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                    <div className="mb-1.5 flex items-center gap-2">
                      <img src={c.avatar_url} alt={c.author} className="h-6 w-6 rounded-full" />
                      <span className="text-sm font-semibold">{c.author}</span>
                      <span className="text-xs text-zinc-400">{new Date(c.created_at).toLocaleDateString()}</span>
                      {/* Reply button — appears on hover */}
                      <button
                        onClick={() => {
                          setReplyTarget(c);
                          setCommentDraft("");
                        }}
                        className="ml-auto hidden group-hover:inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                      >
                        ↩ Reply
                      </button>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{c.body}</ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Reply preview banner ───────────────────── */}
              {replyTarget && (
                <div className="flex items-start gap-2 border-t border-indigo-100 bg-indigo-50 px-4 py-2 dark:border-indigo-900/40 dark:bg-indigo-900/20">
                  <span className="mt-0.5 text-xs text-indigo-500">↩</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Replying to @{replyTarget.author}</span>
                    <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{replyTarget.body.slice(0, 80)}{replyTarget.body.length > 80 ? "…" : ""}</p>
                  </div>
                  <button
                    onClick={() => setReplyTarget(null)}
                    className="shrink-0 rounded px-1 py-0.5 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* ── Compose box ────────────────────────────── */}
              <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <textarea
                  rows={3}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={replyTarget ? `Reply to @${replyTarget.author}…` : "Write a comment… (Markdown supported)"}
                  className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                {commentError && (
                  <p className="mt-1 text-xs text-red-500">{commentError}</p>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-zinc-400">Supports Markdown · Posts to GitHub</span>
                  <button
                    onClick={handlePostComment}
                    disabled={commentPosting || !commentDraft.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {commentPosting ? (
                      <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : "✉"}
                    {commentPosting ? "Posting…" : replyTarget ? "Post Reply" : "Post Comment"}
                  </button>
                </div>
              </div>

            </div>
          )}

          {activeTab === "linked-prs" && (
            <div className="mt-3 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              {linkedPRsLoading && <p className="text-sm text-zinc-400">Loading…</p>}
              {!linkedPRsLoading && linkedPRs?.length === 0 && (
                <p className="text-sm text-zinc-400">No linked PRs found.</p>
              )}

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {linkedPRs?.map((pr) => {
                  const stateColor =
                    pr.state === "open"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : pr.state === "merged"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
                  return (
                    <a
                      key={pr.pr_number}
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-lg bg-zinc-50 p-2 text-xs hover:bg-zinc-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
                    >
                      <span className="font-medium">#{pr.pr_number} {pr.title}</span>
                      <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 font-medium capitalize ${stateColor}`}>
                        {pr.state}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "similar-issues" && (
            <div className="mt-3 rounded-lg border border-violet-200 px-4 py-3 dark:border-violet-900/40">
              {similarIssuesLoading && <p className="text-sm text-zinc-400">Loading…</p>}
              {!similarIssuesLoading && similarIssues?.length === 0 && (
                <p className="text-sm text-zinc-400">No similar issues found.</p>
              )}
              <div className="max-h-[26rem] space-y-2 overflow-y-auto">
                {similarIssues?.map((s) => {
                  const isExpanded = expandedSimilarNum === s.number;
                  const stateColor =
                    s.state === "open"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
                  const pct = Math.round(s.similarity * 100);
                  const barColor =
                    pct >= 80 ? "bg-violet-500" :
                    pct >= 60 ? "bg-indigo-400" :
                    "bg-zinc-300 dark:bg-zinc-600";

                  const handleExpand = async () => {
                    if (isExpanded) {
                      setExpandedSimilarNum(null);
                      setExpandedDetail(null);
                      setExpandedSolution(null);
                      return;
                    }
                    setExpandedSimilarNum(s.number);
                    setExpandedDetail(null);
                    setExpandedSolution(null);
                    setExpandLoading(true);
                    const { owner, repo } = getOwnerRepo();
                    try {
                      const [detail, sol] = await Promise.all([
                        fetchCachedIssueDetail(owner, repo, s.number),
                        checkSolutionExists(s.number),
                      ]);
                      setExpandedDetail(detail);
                      setExpandedSolution(sol);
                    } catch {
                      setExpandedDetail(null);
                      setExpandedSolution(null);
                    } finally {
                      setExpandLoading(false);
                    }
                  };

                  return (
                    <div key={s.number} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                      {/* Row header — always visible */}
                      <button
                        onClick={handleExpand}
                        className={`w-full p-2.5 text-left text-xs transition-colors ${
                          isExpanded
                            ? "bg-violet-50 dark:bg-violet-900/20"
                            : "bg-zinc-50 hover:bg-violet-50 dark:bg-zinc-800/50 dark:hover:bg-violet-900/20"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200">
                            <span className="text-zinc-400 mr-1">#{s.number}</span>
                            {s.title}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            <span className={`rounded-full px-1.5 py-0.5 font-medium capitalize text-[10px] ${stateColor}`}>
                              {s.state}
                            </span>
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                              {pct}%
                            </span>
                            <span className="text-zinc-400 text-[10px]">
                              {isExpanded ? "▲" : "▼"}
                            </span>
                          </div>
                        </div>
                        {/* Similarity bar */}
                        <div className="h-1 rounded-full bg-zinc-200 dark:bg-zinc-700">
                          <div
                            className={`h-1 rounded-full ${barColor} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </button>

                      {/* Inline expanded preview */}
                      {isExpanded && (
                        <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-xs space-y-3">
                          {expandLoading && (
                            <p className="text-zinc-400">Loading preview…</p>
                          )}

                          {!expandLoading && (
                            <>
                              {/* Issue description */}
                              {expandedDetail?.body ? (
                                <div>
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Description</p>
                                  <div className="prose prose-xs dark:prose-invert max-w-none max-h-36 overflow-y-auto text-zinc-700 dark:text-zinc-300">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {expandedDetail.body.slice(0, 800) + (expandedDetail.body.length > 800 ? "\n\n…" : "")}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-zinc-400">No description stored in cache.</p>
                              )}

                              {/* Labels */}
                              {expandedDetail?.labels?.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {expandedDetail.labels.map((lbl: any) => (
                                    <span key={typeof lbl === "string" ? lbl : lbl.id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                      {typeof lbl === "string" ? lbl : lbl.name}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Solution section */}
                              {expandedSolution?.exists && expandedSolution.solution ? (
                                <div className="space-y-2">
                                  {/* Solution Available toggle button */}
                                  <button
                                    onClick={() => setShowSolutionNum(showSolutionNum === s.number ? null : s.number)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/40 transition-colors"
                                  >
                                    <span>💡</span>
                                    {showSolutionNum === s.number ? "Hide solution" : "Solution Available — View"}
                                  </button>

                                  {/* Full solution expanded */}
                                  {showSolutionNum === s.number && (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-900/10 p-3 space-y-3">
                                      {/* Summary */}
                                      <p className="text-zinc-700 dark:text-zinc-200 leading-relaxed">
                                        {expandedSolution.solution.summary}
                                      </p>

                                      {/* Steps */}
                                      {expandedSolution.solution.steps?.length > 0 && (
                                        <ol className="list-decimal list-inside space-y-1 text-zinc-600 dark:text-zinc-300">
                                          {expandedSolution.solution.steps.map((step, i) => (
                                            <li key={i}>{step}</li>
                                          ))}
                                        </ol>
                                      )}

                                       {/* Code changes */}
                                      {expandedSolution.solution.is_code_fix && (expandedSolution.solution.code || expandedSolution.solution.code_before) && (
                                        <div className="space-y-1.5">
                                          {/* File path */}
                                          {expandedSolution.solution.file_path && (
                                            <div className="flex items-center gap-1.5 rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                                              <span className="text-zinc-400 text-[10px]">📁</span>
                                              <code className="text-[10px] font-mono text-zinc-600 dark:text-zinc-300">{expandedSolution.solution.file_path}</code>
                                            </div>
                                          )}

                                          {/* Where to make changes */}
                                          {expandedSolution.solution.code_explanation && (
                                            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2.5 py-1.5">
                                              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-0.5">Where to make changes</p>
                                              <p className="text-[11px] text-zinc-600 dark:text-zinc-300">{expandedSolution.solution.code_explanation}</p>
                                            </div>
                                          )}

                                          {/* BEFORE */}
                                          {expandedSolution.solution.code_before && (
                                            <div className="overflow-hidden rounded border border-red-300 dark:border-red-800">
                                              <div className="bg-red-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-600 dark:bg-red-900/40 dark:text-red-400">
                                                ✕ Before
                                              </div>
                                              <pre className="max-h-36 overflow-auto bg-red-50 px-2 py-2 text-[10px] text-red-900 dark:bg-red-950/30 dark:text-red-200">
                                                <code>{expandedSolution.solution.code_before}</code>
                                              </pre>
                                            </div>
                                          )}

                                          {/* AFTER */}
                                          {(expandedSolution.solution.code_after || expandedSolution.solution.code) && (
                                            <div className="overflow-hidden rounded border border-green-300 dark:border-green-800">
                                              <div className="bg-green-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-600 dark:bg-green-900/40 dark:text-green-400">
                                                ✓ After — {expandedSolution.solution.code_before ? "replacement" : "code to add"}
                                              </div>
                                              <pre className="max-h-36 overflow-auto bg-green-50 px-2 py-2 text-[10px] text-green-900 dark:bg-green-950/30 dark:text-green-200">
                                                <code>{expandedSolution.solution.code_after || expandedSolution.solution.code}</code>
                                              </pre>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                    </div>
                                  )}
                                </div>
                              ) : expandedSolution && !expandedSolution.exists ? (
                                <p className="text-zinc-400 text-[11px]">No solution generated for this issue yet.</p>
                              ) : null}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>


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
