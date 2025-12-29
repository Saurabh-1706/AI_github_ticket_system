import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/db";
import { Repository } from "@/models/Repository";
import { Ticket } from "@/models/Ticket";

export const dynamic = "force-dynamic";

// const SECRET = process.env.GITHUB_WEBHOOK_SECRET as string;

// // ---- Types ----
// type GitHubLabel = { name: string };

// type GitHubIssue = {
//   id: number;
//   number: number;
//   title: string;
//   body: string | null;
//   html_url: string;
//   user: { login: string };
//   labels: GitHubLabel[];
// };

// type GitHubRepo = {
//   id: number;
//   name: string;
//   full_name: string;
//   description: string | null;
//   owner: { login: string };
// };

// // ---- Signature verification ----
// function verifySignature(payload: string, signature: string) {
//   const hmac = crypto.createHmac("sha256", SECRET);
//   const digest = "sha256=" + hmac.update(payload).digest("hex");

//   return crypto.timingSafeEqual(
//     Buffer.from(digest),
//     Buffer.from(signature)
//   );
// }

// export async function POST(req: NextRequest) {
//   console.log("🔔 Webhook hit");

//   const rawBody = await req.text();
//   const payload = JSON.parse(rawBody);

//   await connectDB();

//   const issue: GitHubIssue = payload.issue;
//   const repo: GitHubRepo = payload.repository;

//   // ---- Upsert repository (avoid duplicates) ----
//   await Repository.findOneAndUpdate(
//     { githubRepoId: repo.id },
//     {
//       githubRepoId: repo.id,
//       name: repo.name,
//       fullName: repo.full_name,
//       owner: repo.owner.login,
//       description: repo.description,
//     },
//     { upsert: true, new: true }
//   );

//   // ---- Prevent duplicate tickets ----
//   await Ticket.findOneAndUpdate(
//     { githubIssueId: issue.id.toString() },
//     {
//       githubIssueId: issue.id.toString(),
//       issueNumber: issue.number,
//       repository: repo.full_name,
//       title: issue.title,
//       description: issue.body,
//       author: issue.user.login,
//       issueUrl: issue.html_url,
//       labels: issue.labels.map(l => l.name),
//       status: "open",
//     },
//     { upsert: true, new: true }
//   );

//   return NextResponse.json({ message: "Webhook processed" });
// }


export async function POST() {
  console.log("🔥 WEBHOOK HIT (MINIMAL)");
  return new Response("OK");
}

