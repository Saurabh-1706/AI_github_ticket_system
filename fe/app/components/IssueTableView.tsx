"use client";

import type { Issue } from "../types";
import { useState, useMemo } from "react";

interface IssueTableViewProps {
  issues: Issue[];
  onIssueClick: (issue: Issue) => void;
}

interface Filters {
  search: string;
  state: string;
  category: string;
  criticality: string;
  type: string;
}

export default function IssueTableView({ issues, onIssueClick }: IssueTableViewProps) {
  const [filters, setFilters] = useState<Filters>({
    search: "",
    state: "",
    category: "",
    criticality: "",
    type: "",
  });

  // Get unique values for dropdown filters
  const uniqueStates = useMemo(() => 
    Array.from(new Set(issues.map(i => i.state))).filter(Boolean),
    [issues]
  );

  const uniqueCategories = useMemo(() => 
    Array.from(new Set(issues.map(i => i.category))).filter(Boolean),
    [issues]
  );

  const uniqueCriticalities = useMemo(() => 
    Array.from(new Set(issues.map(i => i.ai_analysis?.criticality))).filter(Boolean),
    [issues]
  );

  const uniqueTypes = useMemo(() => 
    Array.from(new Set(issues.map(i => i.duplicate_info?.classification))).filter(Boolean),
    [issues]
  );

  // Filter issues based on all active filters
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      // Search filter (title and body)
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch = 
          issue.title.toLowerCase().includes(searchLower) ||
          (issue.body?.toLowerCase().includes(searchLower) ?? false);
        if (!matchesSearch) return false;
      }

      // State filter
      if (filters.state && issue.state !== filters.state) return false;

      // Category filter
      if (filters.category && issue.category !== filters.category) return false;

      // Criticality filter
      if (filters.criticality && issue.ai_analysis?.criticality !== filters.criticality) return false;

      // Type filter
      if (filters.type && issue.duplicate_info?.classification !== filters.type) return false;

      return true;
    });
  }, [issues, filters]);

  const clearFilters = () => {
    setFilters({
      search: "",
      state: "",
      category: "",
      criticality: "",
      type: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== "");

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case "bug": return "text-red-600 dark:text-red-400";
      case "feature": return "text-blue-600 dark:text-blue-400";
      case "enhancement": return "text-purple-600 dark:text-purple-400";
      case "documentation": return "text-green-600 dark:text-green-400";
      default: return "text-zinc-600 dark:text-zinc-400";
    }
  };

  const getClassificationColor = (classification?: string) => {
    switch (classification) {
      case "duplicate": return "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400";
      case "related": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "new": return "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400";
      default: return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
    }
  };

  const getCriticalityColor = (criticality?: string) => {
    switch (criticality?.toLowerCase()) {
      case "high": return "text-red-600 dark:text-red-400";
      case "medium": return "text-yellow-600 dark:text-yellow-400";
      case "low": return "text-green-600 dark:text-green-400";
      default: return "text-zinc-600 dark:text-zinc-400";
    }
  };

  const getStateColor = (state: string) => {
    return state === "open" 
      ? "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400" 
      : "bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400";
  };

  return (
    <div className="space-y-4">
      {/* Filter Controls */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Showing {filteredIssues.length} of {issues.length} issues
          </span>
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-16" />
              <col className="w-auto" />
              <col className="w-20" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-28" />
            </colgroup>
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/50">
              {/* Column Headers */}
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  #
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Issue
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  State
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Category
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Criticality
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Similarity
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Type
                </th>
              </tr>
              {/* Filter Row */}
              <tr className="border-t border-zinc-200 dark:border-zinc-700">
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                  />
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filters.state}
                    onChange={(e) => setFilters({ ...filters, state: e.target.value })}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="">All</option>
                    {uniqueStates.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filters.category}
                    onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="">All</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2">
                  <select
                    value={filters.criticality}
                    onChange={(e) => setFilters({ ...filters, criticality: e.target.value })}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="">All</option>
                    {uniqueCriticalities.map(crit => (
                      <option key={crit} value={crit}>{crit}</option>
                    ))}
                  </select>
                </th>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">
                  <select
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  >
                    <option value="">All</option>
                    {uniqueTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredIssues.map((issue) => (
                <tr
                  key={issue.number}
                  onClick={() => onIssueClick(issue)}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-3 py-3">
                    <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                      #{issue.number}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1 overflow-hidden">
                      <div className="overflow-hidden text-ellipsis whitespace-nowrap font-medium text-zinc-900 dark:text-white" title={issue.title}>
                        {issue.title}
                      </div>
                      {issue.body && (
                        <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400" title={issue.body}>
                          {issue.body}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getStateColor(issue.state)}`}>
                      {issue.state}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {issue.category ? (
                      <span className={`text-xs font-medium capitalize ${getCategoryColor(issue.category)}`}>
                        {issue.category}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {issue.ai_analysis?.criticality ? (
                      <span className={`text-xs font-medium capitalize ${getCriticalityColor(issue.ai_analysis.criticality)}`}>
                        {issue.ai_analysis.criticality}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {issue.duplicate_info?.similarity !== undefined ? (
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {Math.round(issue.duplicate_info.similarity * 100)}%
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {issue.duplicate_info?.classification ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${getClassificationColor(issue.duplicate_info.classification)}`}>
                        {issue.duplicate_info.classification}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredIssues.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    No issues match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
