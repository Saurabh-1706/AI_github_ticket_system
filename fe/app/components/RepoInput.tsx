"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RepoInput() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();

    try {
      const parsed = new URL(url);
      const [, owner, repo] = parsed.pathname.split("/");

      if (!owner || !repo) throw new Error();

      router.push(`/repository?owner=${owner}&repo=${repo}`);
    } catch {
      alert("Enter a valid GitHub repository URL");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://github.com/facebook/react"
        className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
      />

      <button
        type="submit"
        className="w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
      >
        Analyze Repository →
      </button>
    </form>
  );
}
