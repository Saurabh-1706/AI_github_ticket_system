import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import { Repository } from "@/models/Repository";
import { Ticket } from "@/models/Ticket";

const SECRET = process.env.GITHUB_WEBHOOK_SECRET as string;

// ---- Types (no `any`) ----
type GitHubLabel = { name: string };

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  user: { login: string };
  labels: GitHubLabel[];
};

type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: { login: string };
};

// ---- Signature verification ----
function verifySignature(payload: string, signature: string) {
  const hmac = crypto.createHmac("sha256", SECRET);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}

export async function POST(req: NextRequest) {
  console.log("🔔 Webhook hit");

  const rawBody = await req.text();
  console.log("Raw body received");

  const payload = JSON.parse(rawBody);

  console.log("Event action:", payload.action);

  await connectDB();
  console.log("✅ DB connected");

  const issue = payload.issue;
  const repo = payload.repository;

  console.log("Repo:", repo.full_name);
  console.log("Issue:", issue.id);

  await Repository.create({
    githubRepoId: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    description: repo.description,
  });

  console.log("✅ Repository inserted");

  await Ticket.create({
    githubIssueId: issue.id.toString(),
    issueNumber: issue.number,
    repository: repo.full_name,
    title: issue.title,
    description: issue.body,
    author: issue.user.login,
    issueUrl: issue.html_url,
    labels: [],
  });

  console.log("✅ Ticket inserted");

  return NextResponse.json({ message: "Inserted (debug mode)" });
}
