const GITHUB_API = "https://api.github.com";

export async function fetchRepo(owner: string, repo: string) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`);
  if (!res.ok) throw new Error("Repo not found");
  return res.json();
}

export async function fetchIssues(owner: string, repo: string) {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues?state=all&per_page=30`
  );

  if (!res.ok) throw new Error("Issues not found");
  return res.json();
}
