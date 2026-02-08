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
