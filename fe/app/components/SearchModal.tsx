"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchIssues, type SearchResult } from "../services/github";

const TYPE_COLORS: Record<string, string> = {
  bug: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  feature: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  security: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  performance: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  documentation: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  question: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

interface Props {
  defaultOwner?: string;
  defaultRepo?: string;
}

export default function SearchModal({ defaultOwner, defaultRepo }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setError(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchIssues(query, defaultOwner, defaultRepo);
        setResults(data.results);
      } catch {
        setError("Search failed. Try again.");
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query, defaultOwner, defaultRepo]);

  const goToIssue = (r: SearchResult) => {
    router.push(`/repository?owner=${r.owner}&repo=${r.repo}&issue=${r.number}`);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Search issues (Ctrl+K)"
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <span>Search issues…</span>
        <kbd className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs dark:bg-zinc-700">Ctrl K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-700">
          <svg className="h-5 w-5 shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={defaultOwner && defaultRepo
              ? `Search in ${defaultOwner}/${defaultRepo}…`
              : "Search issues across all repos…"}
            className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-zinc-400 dark:text-white"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-indigo-500" />
          )}
          <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">
            Esc
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {error && <p className="px-4 py-3 text-sm text-red-500">{error}</p>}

          {!loading && query.length >= 2 && results.length === 0 && !error && (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">No issues found for "{query}"</p>
          )}

          {results.map((r) => (
            <button
              key={`${r.owner}/${r.repo}#${r.number}`}
              onClick={() => goToIssue(r)}
              className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${
                  r.state === "open"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}>
                  {r.state}
                </span>
                {r.type && (
                  <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${TYPE_COLORS[r.type] ?? "bg-zinc-100 text-zinc-600"}`}>
                    {r.type}
                  </span>
                )}
                <span className="text-xs text-zinc-400">{r.owner}/{r.repo} #{r.number}</span>
              </div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">{r.title}</p>
              {r.snippet && (
                <p className="text-xs text-zinc-400 line-clamp-2">{r.snippet}</p>
              )}
            </button>
          ))}

          {!query && (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              Type to search issues by title or body
            </p>
          )}
        </div>

        <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-700">
          {defaultOwner && defaultRepo
            ? `Searching in ${defaultOwner}/${defaultRepo} · `
            : "Searching all cached repos · "}
          <kbd className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">↵</kbd> to open
        </div>
      </div>
    </div>
  );
}
