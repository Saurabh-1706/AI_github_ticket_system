const API_BASE = "http://localhost:8000/api/github";

export async function fetchRepo(owner: string, repo: string) {
  const res = await fetch(`${API_BASE}/repo/${owner}/${repo}`);
  if (!res.ok) {
    const text = await res.text();
    console.error("Repo fetch failed:", res.status, text);
    throw new Error(text || "Repo not found");
  }
    return res.json();
}

export async function fetchIssues(owner: string, repo: string) {
  const res = await fetch(`${API_BASE}/issues/${owner}/${repo}`);

  if (!res.ok) {
    const text = await res.text();
    console.error("Backend error:", res.status, text);
    throw new Error("Failed to fetch issues");
  }

  const data = await res.json();
  return data.issues; // 👈 IMPORTANT
}

export async function analyzeIssue(issue: any) {
  const res = await fetch("http://localhost:8000/api/analysis/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(issue),
  });

  return res.json();
}


export async function fetchSavedRepos() {
  const res = await fetch("http://localhost:8000/api/github/repos");
  if (!res.ok) throw new Error("Failed to fetch repos");
  return res.json();
}
