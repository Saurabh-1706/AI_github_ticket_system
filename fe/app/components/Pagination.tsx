"use client";

import { useState } from "react";

interface PaginationProps {
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  totalIssues?: number;
  totalFetched?: number;
  pagesFetched?: number;
}

export default function Pagination({
  currentPage,
  hasNext,
  hasPrev,
  onPageChange,
  totalIssues,
  totalFetched,
  pagesFetched,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← Previous
        </button>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          Page {currentPage}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Next →
        </button>
      </div>
      <div className="flex flex-col items-end gap-1">
        {totalIssues !== undefined && (
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {totalIssues} {totalIssues === 1 ? 'issue' : 'issues'}
          </div>
        )}
        {totalFetched !== undefined && pagesFetched !== undefined && (
          <div className="text-xs text-zinc-500 dark:text-zinc-500">
            Fetched {totalFetched} items from {pagesFetched} GitHub {pagesFetched === 1 ? 'page' : 'pages'}
          </div>
        )}
      </div>
    </div>
  );
}
