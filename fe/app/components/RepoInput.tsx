"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RepoInput() {
  const [url, setUrl] = useState("");
  const router = useRouter();

  function handleSubmit() {
    try {
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) throw new Error();

      const [, owner, repo] = match;
      router.push(`/repository?owner=${owner}&repo=${repo}`);
    } catch {
      alert("Invalid GitHub repo URL");
    }
  }

  return (
    <div className="flex gap-2">
      <input
        className="border p-2 rounded w-full"
        placeholder="https://github.com/facebook/react"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button
        onClick={handleSubmit}
        className="bg-black text-white px-4 rounded"
      >
        Load
      </button>
    </div>
  );
}
