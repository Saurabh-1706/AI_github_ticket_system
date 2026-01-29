const API_BASE = "http://localhost:8000/api/github";
const ANALYSIS_API = "http://localhost:8000/api/analysis";

/* =========================
   Fetch Repository Metadata
========================= */
export async function fetchRepo(owner: string, repo: string) {
  const res = await fetch(`${API_BASE}/repo/${owner}/${repo}`);

  if (!res.ok) {
    const text = await res.text();
    console.error("Repo fetch error:", res.status, text);
    throw new Error("Repo not found");
  }

  return res.json();
}

/* =========================
   Fetch Issues from Backend
========================= */
export async function fetchIssues(owner: string, repo: string) {
  const res = await fetch(`${API_BASE}/issues/${owner}/${repo}`);

  if (!res.ok) {
    const text = await res.text();
    console.error("Issues fetch error:", res.status, text);
    throw new Error("Failed to fetch issues");
  }

  const data = await res.json();

  // ✅ backend returns { total, issues }
  return data.issues;
}

/* =========================
   Analyze Single Issue (AI + Chroma)
========================= */
export async function analyzeIssue(issue: any) {
  const res = await fetch(`${ANALYSIS_API}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },

    // 🔥 Send full issue context (important)
    body: JSON.stringify({
      issue,
      repo_context: {
        owner: issue.owner,
        repo: issue.repo,
        number: issue.number,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Analysis error:", res.status, text);
    throw new Error("AI analysis failed");
  }

  return res.json();
}
