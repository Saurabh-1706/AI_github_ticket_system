const API_BASE = "http://localhost:8000";

export async function fetchRepo(owner: string, repo: string) {
  const res = await fetch(`${API_BASE}/github/repo/${owner}/${repo}`);
  if (!res.ok) throw new Error("Failed to fetch repository");
  return res.json();
}
