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
export async function analyzeIssue(owner: string, repo: string, issue: any) {
  const res = await fetch(`${API_BASE}/api/analysis/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...issue,
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

  const res = await fetch(url.toString());
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
export async function syncRepository(owner: string, repo: string, force: boolean = false, userToken?: string) {
  const res = await fetch(`${API_BASE}/api/cache/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(userToken ? { "Authorization": `Bearer ${userToken}` } : {})
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
export async function fetchRepositories(): Promise<Repository[]> {
  const res = await fetch(`${API_BASE}/api/cache/repositories`);

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
