"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { fetchRepo, checkRepoAccess, getUserToken, fetchCachedIssues, syncRepository, streamIssues, type CacheIssuesParams } from "../services/github";
import RepoCard from "../components/RepoCard";
import IssueList from "../components/IssueList";
import IssueTableView from "../components/IssueTableView";
import IssueDetail from "../components/IssueDetail";
import PrivateRepoAuth from "../components/PrivateRepoAuth";
import Pagination from "../components/Pagination";
import LoadingSpinner from "../components/LoadingSpinner";
import ViewToggle from "../components/ViewToggle";
import CardFilter, { type CardFilters } from "../components/CardFilter";
import ItemsPerPageSelector from "../components/ItemsPerPageSelector";
import type { Issue } from "../types";
import SearchModal from "../components/SearchModal";
import ReleaseNotesModal from "../components/ReleaseNotesModal";
import RiskReportModal from "../components/RiskReportModal";

export default function RepositoryPage() {
  const params = useSearchParams();
  const owner = params.get("owner");
  const repo = params.get("repo");

  const [repoData, setRepoData] = useState<any>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  
  // View state
  const [view, setView] = useState<"card" | "table">("card");
  
  // Card filter state
  const [cardFilters, setCardFilters] = useState<CardFilters>({
    state: "",
    category: "",
    type: "",
    criticality: "",
    minSimilarity: 0,
  });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);
  const [totalIssues, setTotalIssues] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  
  // Cache info state
  const [cacheInfo, setCacheInfo] = useState<any>(null);
  const [backgroundSyncing, setBackgroundSyncing] = useState(false);
  const [syncedNewCount, setSyncedNewCount] = useState<number | null>(null);

  // OAuth and private repo state
  const [isPrivate, setIsPrivate] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

  // Streaming state (used on first visit when cache is empty)
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedTotal, setStreamedTotal] = useState(0);

  useEffect(() => {
    // Check for OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const oauthSuccess = urlParams.get("oauth");
    const username = urlParams.get("username");
    
    if (oauthSuccess === "success" && username) {
      setGithubUsername(username);
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname + "?" + 
        new URLSearchParams({ owner: owner || "", repo: repo || "" }).toString()
      );
    }
  }, [owner, repo]);

  useEffect(() => {
    if (!owner || !repo) return;

    // Persist last visited repo so the Analyze Repo sidebar link can restore it
    localStorage.setItem("lastRepo", JSON.stringify({ owner, repo }));

    const loadData = async () => {
      try {
        // Step 1: Check if repo is accessible
        const accessInfo = await checkRepoAccess(owner, repo, userToken || undefined);
        
        console.log("🔍 Repository Access Check:", {
          repo: `${owner}/${repo}`,
          isPrivate: accessInfo.is_private,
          hasAccess: accessInfo.has_access,
          requiresAuth: accessInfo.requires_auth,
          repoExists: accessInfo.repo_exists
        });
        
        setIsPrivate(accessInfo.is_private);
        setRequiresAuth(accessInfo.requires_auth);

        // Step 2: If requires auth and we have a username, try to get token
        if (accessInfo.requires_auth && githubUsername && !userToken) {
          console.log("🔑 Attempting to retrieve stored token for:", githubUsername);
          try {
            const token = await getUserToken(githubUsername);
            if (token) {
              console.log("✅ Token retrieved, retrying access check");
              setUserToken(token);
              // Retry with token
              const accessInfoWithToken = await checkRepoAccess(owner, repo, token);
              setRequiresAuth(accessInfoWithToken.requires_auth);
              
              if (!accessInfoWithToken.requires_auth) {
                // We have access now, load data
                console.log("✅ Access granted with token, loading data");
                const authToken = localStorage.getItem("auth_token");
                const repoRes = await fetchRepo(owner, repo, token, authToken || undefined);
                setRepoData(repoRes);
                
                // Fetch issues from cache
                setIssues([]);
                setLoading(true);
                
                const cacheParams: CacheIssuesParams = {
                  owner,
                  repo,
                  page: currentPage,
                  per_page: itemsPerPage,
                  user_token: token
                };
                
                const issuesRes = await fetchCachedIssues(cacheParams);
                setIssues(issuesRes.issues);
                setTotalIssues(issuesRes.pagination.total);
                setTotalPages(issuesRes.pagination.total_pages);
                setCacheInfo(issuesRes.cache_info);
                setLoading(false);
              }
            } else {
              console.log("⚠️ No token found for user");
            }
          } catch (err) {
            console.error("❌ Failed to get user token:", err);
          }
        } else if (!accessInfo.requires_auth) {
          // Public repo or we have access
          console.log("✅ Public repo or access granted, loading data");
          const authToken = localStorage.getItem("auth_token");
          const repoRes = await fetchRepo(owner, repo, userToken || undefined, authToken || undefined);
          setRepoData(repoRes);
          
          // Fetch issues from cache with filters
          setIssues([]);
          setLoading(true);
          
          const cacheParams: CacheIssuesParams = {
            owner,
            repo,
            page: currentPage,
            per_page: itemsPerPage,
            state: cardFilters.state || undefined,
            category: cardFilters.category || undefined,
            type: cardFilters.type || undefined,
            criticality: cardFilters.criticality || undefined,
            min_similarity: cardFilters.minSimilarity > 0 ? cardFilters.minSimilarity : undefined,
            user_token: userToken || undefined
          };
          
          const issuesRes = await fetchCachedIssues(cacheParams);

          if (issuesRes.pagination.total === 0) {
            // ── First visit: no cache yet ──────────────────────────────────────
            // Stream issues directly from GitHub so the user sees them instantly.
            // The backend kicks off background AI-analysis + DB store after streaming.
            console.log("📡 No cache yet — streaming issues from GitHub");
            setLoading(false);
            setIsStreaming(true);
            setStreamedTotal(0);
            setIssues([]);

            streamIssues(
              owner, repo, userToken || undefined,
              (issue) => {
                setIssues(prev => {
                  // Only keep up to itemsPerPage issues in view (first page)
                  if (prev.length >= itemsPerPage) return prev;
                  return [...prev, issue as Issue];
                });
                setTotalIssues(prev => prev + 1);
              },
              (fetched) => setStreamedTotal(fetched),
              (total) => {
                setStreamedTotal(total);
                setIsStreaming(false);
                setTotalPages(Math.ceil(total / itemsPerPage));
              },
              (err) => {
                console.error("Stream error:", err);
                setIsStreaming(false);
                setError("Failed to load issues: " + err);
              },
            );
          } else {
            // ── Returning visit: serve from fast DB cache ──────────────────────
            setIssues(issuesRes.issues);
            setTotalIssues(issuesRes.pagination.total);
            setTotalPages(issuesRes.pagination.total_pages);
            setCacheInfo(issuesRes.cache_info);
            setLoading(false);

            // Background sync if stale
            if (!issuesRes.cache_info.is_fresh) {
              console.log("🔄 Cache is stale, syncing in background...");
              setBackgroundSyncing(true);
              setSyncedNewCount(null);
              const prevTotal = issuesRes.pagination.total;
              syncRepository(owner, repo, false, userToken || undefined, localStorage.getItem('auth_token') || undefined)
                .then(async () => {
                  console.log("✅ Background sync complete — refreshing issues");
                  const freshRes = await fetchCachedIssues({
                    owner, repo,
                    page: currentPage,
                    per_page: itemsPerPage,
                    state: cardFilters.state || undefined,
                    category: cardFilters.category || undefined,
                    type: cardFilters.type || undefined,
                    criticality: cardFilters.criticality || undefined,
                    min_similarity: cardFilters.minSimilarity > 0 ? cardFilters.minSimilarity : undefined,
                    user_token: userToken || undefined,
                  });
                  setIssues(freshRes.issues);
                  setTotalIssues(freshRes.pagination.total);
                  setTotalPages(freshRes.pagination.total_pages);
                  setCacheInfo(freshRes.cache_info);
                  const diff = freshRes.pagination.total - prevTotal;
                  if (diff > 0) setSyncedNewCount(diff);
                  setTimeout(() => setSyncedNewCount(null), 4000);
                })
                .catch(err => console.error("❌ Background sync failed:", err))
                .finally(() => setBackgroundSyncing(false));
            }
          }
        } else {
          console.log("🔒 Private repo requires OAuth authorization");
        }
      } catch (err) {
        console.error("❌ Error loading data:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [owner, repo, userToken, githubUsername, currentPage, itemsPerPage, cardFilters]);




  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [cardFilters]);

  const handleSelectSimilar = (similar: any) => {
    const match = issues.find((i) => i.number === similar.number);
    if (match) setSelectedIssue(match);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter issues for both card and table views
  const filteredIssues = useMemo(() => {
    return issues.filter(issue => {
      // State filter
      if (cardFilters.state && issue.state !== cardFilters.state) {
        return false;
      }
      
      // Category filter
      if (cardFilters.category && issue.category !== cardFilters.category) {
        return false;
      }
      
      // Type filter
      if (cardFilters.type && issue.duplicate_info?.classification !== cardFilters.type) {
        return false;
      }
      
      // Criticality filter
      if (cardFilters.criticality && issue.ai_analysis?.criticality?.toLowerCase() !== cardFilters.criticality.toLowerCase()) {
        return false;
      }
      
      // Minimum similarity filter
      if (cardFilters.minSimilarity > 0) {
        const similarity = issue.duplicate_info?.similarity ?? 0;
        if (similarity * 100 < cardFilters.minSimilarity) {
          return false;
        }
      }
      
      return true;
    });
  }, [issues, cardFilters]);

  if (loading && issues.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" message="Loading repository..." />
      </div>
    );
  }

  // Show OAuth prompt if private repo requires auth
  if (requiresAuth && isPrivate) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-black">
        <main className="mx-auto max-w-3xl px-4 py-12">
          <PrivateRepoAuth 
            owner={owner!} 
            repo={repo!}
            onAuthComplete={() => window.location.reload()}
          />
        </main>
      </div>
    );
  }


  const handleSelectIssue = async (issue: any) => {
    // Just set the issue directly - it already has all the correct data from cache
    // including ai_analysis with type, criticality, confidence, and similar_issues
    setSelectedIssue({
      ...issue,
      // Ensure similar_issues is available at top level for IssueDetail component
      similar_issues: issue.ai_analysis?.similar_issues ?? issue.similar_issues ?? []
    });
  };
  

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-[1600px] py-8">
        <div className="flex gap-6">
          {/* Main content - issues list */}
          <div
            className={`
              transition-all duration-300
              ${selectedIssue ? "hidden md:block md:w-1/2 lg:w-3/5" : "w-full"}
            `}
          >

            <div className="mb-6 space-y-4 px-4">
              <RepoCard repo={repoData} />

              {/* ── First-visit streaming indicator ── */}
              {isStreaming && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-xs text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-300">
                  <div className="flex items-center gap-2 mb-1.5">
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 0v4a8 8 0 00-8 8H0z" />
                    </svg>
                    <span>Streaming {streamedTotal.toLocaleString()} issues from GitHub… (AI analysis running in background)</span>
                  </div>
                  <div className="w-full h-1 bg-violet-100 dark:bg-violet-800 rounded-full overflow-hidden">
                    <div className="h-1 bg-violet-500 rounded-full animate-pulse" style={{ width: "100%" }} />
                  </div>
                </div>
              )}

              {/* ── Background sync indicator ── */}
              {backgroundSyncing && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 0v4a8 8 0 00-8 8H0z" />
                  </svg>
                  Syncing latest issues in background…
                </div>
              )}
              {syncedNewCount !== null && syncedNewCount > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                  ✅ {syncedNewCount} new issue{syncedNewCount > 1 ? "s" : ""} loaded from latest sync
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Showing {filteredIssues.length} of {issues.length} issues on this page
                  </span>
                  <ItemsPerPageSelector value={itemsPerPage} onChange={setItemsPerPage} />
                </div>
                <div className="flex gap-2">
                  <SearchModal defaultOwner={owner ?? undefined} defaultRepo={repo ?? undefined} />
                  <ReleaseNotesModal
                    owner={owner ?? ""}
                    repo={repo ?? ""}
                    userToken={userToken ?? undefined}
                  />
                  <RiskReportModal owner={owner ?? ""} repo={repo ?? ""} />
                  <CardFilter filters={cardFilters} onFilterChange={setCardFilters} />
                  <ViewToggle view={view} onViewChange={setView} />
                </div>
              </div>
            </div>

            <div className={view === "card" ? "px-4" : ""}>
              {view === "card" ? (
                <IssueList
                  issues={filteredIssues}
                  onSelect={handleSelectIssue}
                  onSelectSimilar={handleSelectSimilar}
                />
              ) : (
                <IssueTableView
                  issues={filteredIssues}
                  onIssueClick={handleSelectIssue}
                />
              )}
            </div>
            
            {/* Pagination */}
            {totalPages > 0 && (
              <div className="mt-6 px-4">
                <Pagination
                  currentPage={currentPage}
                  hasNext={currentPage < totalPages}
                  hasPrev={currentPage > 1}
                  onPageChange={handlePageChange}
                  totalIssues={totalIssues}
                  totalFetched={totalIssues}
                  pagesFetched={totalPages}
                />
              </div>
            )}
          </div>

          {/* RIGHT: ISSUE DETAIL PANEL */}
          <div
            className={`
              fixed inset-y-0 right-0 z-40
              w-full md:w-1/2 lg:w-2/5
              bg-white dark:bg-zinc-900
              border-l border-zinc-200 dark:border-zinc-800
              transform transition-transform duration-300 ease-in-out
              ${selectedIssue ? "translate-x-0" : "translate-x-full"}
            `}
          >
            {selectedIssue && (
              <IssueDetail
                issue={selectedIssue}
                onClose={() => setSelectedIssue(null)}
                onSelectSimilar={handleSelectSimilar}
              />
            )}
          </div>

        </div>

      </main>

    </div>
  );
}

/* ✅ MUST BE BELOW (same file) */
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
