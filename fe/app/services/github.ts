const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Check if a repository is accessible and whether it's public or private
 */
export async function checkRepoAccess(owner: string, repo: string, userToken?: string) {
  const url = new URL(`${API_BASE}/api/github/check-access/${owner}/${repo}`);
  if (userToken) {
    url.searchParams.append("user_token", userToken);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error("Failed to check repository access");
  }

  return res.json() as Promise<{
    is_private: boolean;
    has_access: boolean;
    requires_auth: boolean;
    repo_exists: boolean;
  }>;
}

/**
 * Fetch repository details
 */
export async function fetchRepo(owner: string, repo: string, userToken?: string, authToken?: string) {
  const url = new URL(`${API_BASE}/api/github/repo/${owner}/${repo}`);
  if (userToken) {
    url.searchParams.append("user_token", userToken);
  }

  const headers: HeadersInit = {};
  // Add authentication token if provided (for user association)
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error("Repo fetch failed:", res.status, text);
    throw new Error(text || "Repo not found");
  }
  return res.json();
}

/**
 * Fetch repository issues with pagination
 */
export async function fetchIssues(owner: string, repo: string, userToken?: string, page: number = 1, perPage: number = 30) {
  const url = new URL(`${API_BASE}/api/github/issues/${owner}/${repo}`);
  if (userToken) {
    url.searchParams.append("user_token", userToken);
  }
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", perPage.toString());

  const res = await fetch(url.toString());

  if (!res.ok) {
    const text = await res.text();
    console.error("Backend error:", res.status, text);
    throw new Error("Failed to fetch issues");
  }

  const data = await res.json();
  return data; // Returns { total, issues, pagination }
}

/**
 * Fetch ALL issues from repository (paginating through GitHub API)
 */
export async function fetchAllIssues(
  owner: string,
  repo: string,
  userToken?: string,
  onProgress?: (loaded: number, total: number) => void
) {
  const allIssues: any[] = [];
  let page = 1;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const data = await fetchIssues(owner, repo, userToken, page, 100); // Fetch 100 per page for efficiency

    if (page === 1) {
      total = data.total || 0;
    }

    allIssues.push(...data.issues);

    // Report progress
    if (onProgress) {
      onProgress(allIssues.length, total);
    }

    // Check if there are more pages
    hasMore = data.pagination?.has_next || false;
    page++;
  }

  return {
    issues: allIssues,
    total: allIssues.length
  };
}

/**
 * Analyze a single issue within repository context
 */
export async function analyzeIssue(owner: string, repo: string, issue: { id: number | string; title: string; body: string }) {
  const res = await fetch(`${API_BASE}/api/analysis/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: issue.id,
      title: issue.title,
      body: issue.body,
      owner,
      repo,
    }),
  });

  return res.json();
}

/**
 * Check OAuth status for a GitHub username
 */
export async function checkOAuthStatus(username: string) {
  const res = await fetch(`${API_BASE}/api/oauth/status/${username}`);
  if (!res.ok) throw new Error("Failed to check OAuth status");
  return res.json() as Promise<{
    authorized: boolean;
    username: string | null;
    authorized_at: string | null;
  }>;
}

/**
 * Get user's OAuth token (for internal use)
 */
export async function getUserToken(username: string) {
  const res = await fetch(`${API_BASE}/api/oauth/token/${username}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to get user token");
  }
  const data = await res.json();
  return data.access_token as string;
}

/**
 * Fetch saved/analyzed repositories for the current user
 */
export async function fetchSavedRepos(authToken?: string) {
  const headers: HeadersInit = {};

  // Add auth token if provided
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}/api/github/repos`, { headers });
  if (!res.ok) {
    throw new Error("Failed to fetch saved repos");
  }
  return res.json();
}

/**
 * Cache API - Fetch cached issues with filters and pagination
 */
export interface CacheIssuesParams {
  owner: string;
  repo: string;
  page?: number;
  per_page?: number;
  state?: string;
  category?: string;
  type?: string;
  criticality?: string;
  min_similarity?: number;
  user_token?: string;
}

export interface CachedIssuesResponse {
  issues: any[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
  cache_info: {
    last_synced: string | null;
    total_cached: number;
    is_fresh: boolean;
  };
}

export async function fetchCachedIssues(params: CacheIssuesParams): Promise<CachedIssuesResponse> {
  const url = new URL(`${API_BASE}/api/cache/issues`);

  // Add all parameters to URL
  url.searchParams.append("owner", params.owner);
  url.searchParams.append("repo", params.repo);
  if (params.page) url.searchParams.append("page", params.page.toString());
  if (params.per_page) url.searchParams.append("per_page", params.per_page.toString());
  if (params.state) url.searchParams.append("state", params.state);
  if (params.category) url.searchParams.append("category", params.category);
  if (params.type) url.searchParams.append("type", params.type);
  if (params.criticality) url.searchParams.append("criticality", params.criticality);
  if (params.min_similarity) url.searchParams.append("min_similarity", params.min_similarity.toString());
  if (params.user_token) url.searchParams.append("user_token", params.user_token);

  // Send auth token so the backend can stamp synced_by_user_id on the repo (backfill)
  const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const headers: HeadersInit = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const text = await res.text();
    console.error("Cache fetch failed:", res.status, text);
    throw new Error("Failed to fetch cached issues");
  }

  return res.json();
}

/**
 * Sync repository - Fetch new/updated issues from GitHub and update cache
 */
export async function syncRepository(owner: string, repo: string, force: boolean = false, userToken?: string, authToken?: string) {
  const res = await fetch(`${API_BASE}/api/cache/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // authToken is the app JWT (used for user isolation); userToken is the raw GitHub token (for private repos)
      ...((authToken || userToken) ? { "Authorization": `Bearer ${authToken ?? userToken}` } : {})
    },
    body: JSON.stringify({
      owner,
      repo,
      force_full_sync: force
    })
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Sync failed:", res.status, text);
    throw new Error("Failed to sync repository");
  }

  return res.json();
}

/**
 * Get cache status for a repository
 */
export async function getCacheStatus(owner: string, repo: string) {
  const url = new URL(`${API_BASE}/api/cache/status`);
  url.searchParams.append("owner", owner);
  url.searchParams.append("repo", repo);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error("Failed to get cache status");
  }

  return res.json();
}

/**
 * Stream issues directly from GitHub via NDJSON (for first-visit, no-cache case).
 * Calls onIssue for each issue as it arrives.
 * Calls onComplete when the stream ends.
 * Returns an AbortController.abort() fn to cancel.
 */
export function streamIssues(
  owner: string,
  repo: string,
  userToken: string | undefined,
  onIssue: (issue: any) => void,
  onProgress: (fetched: number) => void,
  onComplete: (total: number) => void,
  onError: (err: string) => void,
): AbortController {
  const ctrl = new AbortController();
  const url = new URL(`${API_BASE}/api/github/issues/${owner}/${repo}/stream`);
  if (userToken) url.searchParams.set("user_token", userToken);

  (async () => {
    try {
      const res = await fetch(url.toString(), { signal: ctrl.signal });
      if (!res.ok || !res.body) {
        onError("Streaming endpoint unavailable");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";  // keep incomplete line in buffer
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "issue") onIssue(msg.data);
            if (msg.type === "progress") onProgress(msg.fetched);
            if (msg.type === "complete") onComplete(msg.total);
            if (msg.type === "error") onError(msg.error);
          } catch { /* malformed line — skip */ }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") onError(String(e));
    }
  })();

  return ctrl;
}


// ─────────────────────────────────────────────────────────────
/**
 * Repository interface
 */
export interface Repository {
  owner: string;
  name: string;
  full_name: string;
  issue_count: number;
  last_synced: string;
  created_at: string;
}

/**
 * Fetch all analyzed repositories
 */
export async function fetchRepositories(authToken?: string): Promise<Repository[]> {
  const headers: HeadersInit = {};
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}/api/cache/repositories`, { headers });

  if (!res.ok) {
    throw new Error("Failed to fetch repositories");
  }

  const data = await res.json();
  return data.repositories;
}

/**
 * Delete a repository from cache
 */
export async function deleteRepository(owner: string, repo: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/cache/repositories/${owner}/${repo}`, {
    method: "DELETE"
  });

  if (!res.ok) {
    throw new Error("Failed to delete repository");
  }

  return res.json();
}

// ─────────────────────────────────────────────────────────────
// Solution Generation
// ─────────────────────────────────────────────────────────────

export interface GeneratedSolution {
  issue_id: string;
  summary: string;
  is_code_fix: boolean;
  steps: string[];
  // Precise diff fields
  file_path: string;
  path_confirmed: boolean;  // true = path came from real indexed files; false = GPT-guessed
  code_before: string;
  code_after: string;
  // Legacy fallback
  code: string;
  code_language: string;
  code_explanation: string;
  generated_by: string;
  owner: string;
  repo: string;
  issue_title: string;
  created_at: string;
}


/**
 * Generate (or retrieve cached) AI solution for a GitHub issue.
 * Calls POST /api/solution/generate.
 */
export async function generateSolution(
  issueId: string,
  title: string,
  body: string,
  owner: string,
  repo: string
): Promise<{ cached: boolean; solution: GeneratedSolution }> {
  const res = await fetch(`${API_BASE}/api/solution/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issue_id: issueId,
      title,
      body,
      owner,
      repo,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Solution generation failed:", res.status, text);
    throw new Error("Failed to generate solution. Please try again.");
  }

  return res.json();
}


// ─────────────────────────────────────────────────────────────
// PR Stats
// ─────────────────────────────────────────────────────────────

export interface PRStats {
  open_prs: number;
  closed_prs: number;
  total_prs: number;
}

export async function fetchPRStats(owner: string, repo: string, userToken?: string): Promise<PRStats> {
  const params = userToken ? `?user_token=${userToken}` : "";
  const res = await fetch(`${API_BASE}/api/github/pr-stats/${owner}/${repo}${params}`);
  if (!res.ok) throw new Error("Failed to fetch PR stats");
  return res.json();
}


// ─────────────────────────────────────────────────────────────
// Issue Comments
// ─────────────────────────────────────────────────────────────

export interface IssueComment {
  id: number;
  author: string;
  avatar_url: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  userToken?: string
): Promise<{ comments: IssueComment[]; count: number }> {
  const params = userToken ? `?user_token=${userToken}` : "";
  const res = await fetch(
    `${API_BASE}/api/github/comments/${owner}/${repo}/${issueNumber}${params}`
  );
  if (!res.ok) throw new Error("Failed to fetch comments");
  return res.json();
}


// ─────────────────────────────────────────────────────────────
// Linked PRs
// ─────────────────────────────────────────────────────────────

export interface LinkedPR {
  pr_number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  created_at: string;
}

export async function fetchLinkedPRs(
  owner: string,
  repo: string,
  issueNumber: number,
  userToken?: string
): Promise<{ linked_prs: LinkedPR[]; count: number }> {
  const params = userToken ? `?user_token=${userToken}` : "";
  const res = await fetch(
    `${API_BASE}/api/github/linked-prs/${owner}/${repo}/${issueNumber}${params}`
  );
  if (!res.ok) throw new Error("Failed to fetch linked PRs");
  return res.json();
}


// ─────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  total_issues: number;
  by_type: Record<string, number>;
  by_week: { label: string; count: number }[];
  by_criticality: Record<string, number>;
  duplicate_rate: number;
  state: { open: number; closed: number };
}

export async function fetchAnalyticsSummary(
  owner: string,
  repo: string
): Promise<AnalyticsSummary> {
  const res = await fetch(
    `${API_BASE}/api/analytics/summary?owner=${owner}&repo=${repo}`
  );
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}


// ─────────────────────────────────────────────────────────────
// Full-text Search
// ─────────────────────────────────────────────────────────────

export interface SearchResult {
  number: number;
  title: string;
  state: string;
  snippet: string;
  owner: string;
  repo: string;
  type?: string;
  criticality?: string;
}

export async function searchIssues(
  q: string,
  owner?: string,
  repo?: string
): Promise<{ results: SearchResult[]; count: number; query: string }> {
  const params = new URLSearchParams({ q });
  if (owner) params.set("owner", owner);
  if (repo) params.set("repo", repo);
  const res = await fetch(`${API_BASE}/api/github/search?${params}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}


// ─────────────────────────────────────────────────────────────
// AI Features — Labels & Priority
// ─────────────────────────────────────────────────────────────

export interface LabelSuggestion {
  suggested_labels: string[];
  source: string;
}

export async function fetchSuggestedLabels(
  owner: string,
  repo: string,
  issueNumber: number,
  title: string,
  body: string
): Promise<LabelSuggestion> {
  const res = await fetch(`${API_BASE}/api/ai/suggest-labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, issue_number: issueNumber, title, body }),
  });
  if (!res.ok) throw new Error("Failed to fetch label suggestions");
  return res.json();
}

export interface PriorityScore {
  score: number;
  label: string;
  emoji: string;
  breakdown: Record<string, number>;
}

export async function fetchPriorityScore(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<PriorityScore> {
  const res = await fetch(
    `${API_BASE}/api/ai/priority-score/${owner}/${repo}/${issueNumber}`
  );
  if (!res.ok) throw new Error("Failed to fetch priority score");
  return res.json();
}


// ─────────────────────────────────────────────────────────────
// Similar Issues
// ─────────────────────────────────────────────────────────────

export interface SimilarIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  similarity: number;
}

export async function fetchSimilarIssues(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ similar_issues: SimilarIssue[]; count: number }> {
  const res = await fetch(
    `${API_BASE}/api/ai/similar-issues/${owner}/${repo}/${issueNumber}`
  );
  if (!res.ok) throw new Error("Failed to fetch similar issues");
  return res.json();
}

export interface CachedSolution {
  summary: string;
  is_code_fix: boolean;
  steps: string[];
  // Precise diff fields (populated when code context was available)
  file_path: string;
  code_before: string;
  code_after: string;
  // Legacy fallback
  code: string;
  code_language: string;
  code_explanation: string;
}


/** Check if a cached solution already exists for an issue. Returns full solution if found. */
export async function checkSolutionExists(
  issueId: string | number
): Promise<{ exists: boolean; issue_id: string; solution: CachedSolution | null }> {
  const res = await fetch(`${API_BASE}/api/solution/check/${issueId}`);
  if (!res.ok) throw new Error("Failed to check solution");
  return res.json();
}


/**
 * Delete the cached GPT solution for an issue.
 * Allows the user to regenerate a fresh solution with up-to-date code context.
 */
export async function deleteSolution(issueId: string | number): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_BASE}/api/solution/${issueId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete cached solution");
  return res.json();
}


/** Fetch full cached issue detail by number (single-item endpoint — fast). */
export async function fetchCachedIssueDetail(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<any | null> {
  const res = await fetch(`${API_BASE}/api/cache/issues/${owner}/${repo}/${issueNumber}`);
  if (!res.ok) return null;
  return res.json();
}




// ─────────────────────────────────────────────────────────────
// Global Analytics (multi-repo)
// ─────────────────────────────────────────────────────────────

export interface GlobalIssue {
  number: number;
  title: string;
  state: string;
  owner: string;
  repo: string;
  type?: string;
  criticality?: string;
  created_at?: string;
}

export interface GlobalAnalytics {
  total: number;
  by_repo: { owner: string; repo: string; full_name: string; count: number }[];
  by_type: Record<string, number>;
  issues: GlobalIssue[];
}

export async function fetchGlobalAnalytics(filters?: {
  state?: string;
  issue_type?: string;
  criticality?: string;
}): Promise<GlobalAnalytics> {
  const params = new URLSearchParams();
  if (filters?.state) params.set("state", filters.state);
  if (filters?.issue_type) params.set("issue_type", filters.issue_type);
  if (filters?.criticality) params.set("criticality", filters.criticality);
  const res = await fetch(`${API_BASE}/api/analytics/global?${params}`);
  if (!res.ok) throw new Error("Failed to fetch global analytics");
  return res.json();
}


// -----------------------------------------------------------------
// Post / Reply comment on an issue
// -----------------------------------------------------------------

export interface PostedComment {
  id: number;
  author: string;
  avatar_url: string;
  body: string;
  created_at: string;
  updated_at: string;
  url: string;
}

/**
 * Post a comment on a GitHub issue.
 * Pass replyTo to auto-format as a markdown quote-reply:
 *   > original line
 *
 *   @author <body>
 */
export async function postIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  authToken: string,   // app JWT (auth_token from localStorage) - NOT a raw GitHub token
  replyTo?: { author: string; body: string }
): Promise<PostedComment> {
  let finalBody = body;
  if (replyTo) {
    const quoted = replyTo.body
      .split("\n")
      .map((l) => "> " + l)
      .join("\n");
    finalBody = quoted + "\n\n@" + replyTo.author + " " + body;
  }
  const res = await fetch(
    `${API_BASE}/api/github/comment/${owner}/${repo}/${issueNumber}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
      },
      body: JSON.stringify({ body: finalBody }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    let msg = "Failed to post comment";
    try { msg = JSON.parse(errText).detail ?? msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}


// ─────────────────────────────────────────────────────────────────────────────
// Release Notes
// ─────────────────────────────────────────────────────────────────────────────

export interface Milestone {
  number: number;
  title: string;
  description: string;
  state: "open" | "closed";
  open_issues: number;
  closed_issues: number;
  due_on: string | null;
}

export async function fetchMilestones(
  owner: string,
  repo: string,
  userToken?: string
): Promise<{ milestones: Milestone[]; count: number }> {
  const params = userToken ? `?user_token=${userToken}` : "";
  const res = await fetch(`${API_BASE}/api/ai/milestones/${owner}/${repo}${params}`);
  if (!res.ok) throw new Error("Failed to fetch milestones");
  return res.json();
}

export interface ReleaseNotes {
  version: string;
  summary: string;
  sections: Record<string, string[]>;
  raw_markdown: string;
}

export async function generateReleaseNotes(
  owner: string,
  repo: string,
  milestoneNumber: number,
  userToken?: string
): Promise<ReleaseNotes> {
  const res = await fetch(`${API_BASE}/api/ai/release-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner, repo, milestone_number: milestoneNumber, user_token: userToken }),
  });
  if (!res.ok) throw new Error("Failed to generate release notes");
  return res.json();
}


// ─────────────────────────────────────────────────────────────────────────────
// Suggested Assignees
// ─────────────────────────────────────────────────────────────────────────────

export interface SuggestedAssignee {
  login: string;
  avatar_url: string;
  profile_url: string;
  commit_count: number;
}

export async function fetchSuggestedAssignees(
  owner: string,
  repo: string,
  issueNumber: number,
  userToken?: string
): Promise<{ assignees: SuggestedAssignee[]; source: string; keywords?: string[] }> {
  const params = userToken ? `?user_token=${userToken}` : "";
  const res = await fetch(
    `${API_BASE}/api/ai/suggest-assignees/${owner}/${repo}/${issueNumber}${params}`
  );
  if (!res.ok) throw new Error("Failed to fetch suggested assignees");
  return res.json();
}


// ─────────────────────────────────────────────────────────────────────────────
// Risk Assessment Report
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskReport {
  risk_score: number;
  risk_level: "Low" | "Medium" | "High" | "Critical";
  executive_summary: string;
  top_risks: {
    title: string;
    severity: "Low" | "Medium" | "High" | "Critical";
    description: string;
    mitigation: string;
  }[];
  recommendations: string[];
  risk_areas: {
    code_quality: number;
    security: number;
    technical_debt: number;
    team_velocity: number;
    reliability: number;
  };
  stats: {
    total: number;
    open: number;
    closed: number;
    close_rate: number;
    by_type: Record<string, number>;
    by_criticality: Record<string, number>;
    stale: { "30d": number; "60d": number; "90d": number };
    duplicate_rate: number;
    security_count: number;
    top_keywords: string[];
    by_month: { label: string; count: number }[];
  };
}

export async function fetchRiskReport(owner: string, repo: string): Promise<RiskReport> {
  const res = await fetch(`${API_BASE}/api/ai/risk-report/${owner}/${repo}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Failed to generate risk report" }));
    throw new Error(err.detail || "Failed to generate risk report");
  }
  return res.json();
}


