export async function getReuseAdvice(similarIssue: any) {
  const res = await fetch("http://localhost:8000/api/solution/reuse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ similar_issue: similarIssue }),
  });

  return res.json();
}
