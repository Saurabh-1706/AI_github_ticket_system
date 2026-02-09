"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { fetchRepo, fetchIssues, checkRepoAccess, getUserToken, analyzeIssue } from "../services/github";
import { streamIssues } from "../services/streaming";
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
import type { Issue, PaginationInfo } from "../types";

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
  const [paginationInfo, setPaginationInfo] = useState<PaginationInfo | null>(null);
  
  // OAuth and private repo state
  const [isPrivate, setIsPrivate] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);

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
                
                // Fetch issues with pagination
                setIssues([]);
                setLoading(true);
                
                const issuesRes = await fetchIssues(owner, repo, token, currentPage, itemsPerPage);
                setIssues(issuesRes.issues);
                setPaginationInfo(issuesRes.pagination);
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
          
          // Fetch issues with pagination
          setIssues([]);
          setLoading(true);
          
          const issuesRes = await fetchIssues(owner, repo, userToken || undefined, currentPage, itemsPerPage);
          setIssues(issuesRes.issues);
          setPaginationInfo(issuesRes.pagination);
          setLoading(false);
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
  }, [owner, repo, userToken, githubUsername, currentPage, itemsPerPage]);

  useEffect(() => {
    console.log("selectedIssue =", selectedIssue);
  }, [selectedIssue]);

  const handleSelectSimilar = (similar: any) => {
    const match = issues.find((i) => i.number === similar.number);
    if (match) setSelectedIssue(match);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter issues on current page (for card view only)
  const filteredIssues = useMemo(() => {
    if (view !== "card") return issues;
    
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
  }, [issues, cardFilters, view]);

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
    setSelectedIssue(issue); // open panel immediately
  
    try {
      const analysis = await analyzeIssue(owner!, repo!, issue);
      
      setSelectedIssue({
        ...issue,
        ai_analysis: {
          type: analysis.type,
          criticality: analysis.criticality,
          confidence: analysis.confidence,
          solution: analysis.solution,
        },
        duplicate_info: analysis.similar_issues?.[0] ?? null,
        similar_issues: analysis.similar_issues ?? [],
      });
    } catch (e) {
      console.error("Analysis failed", e);
    }
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Showing {filteredIssues.length} of {issues.length} issues on this page
                  </span>
                  <ItemsPerPageSelector value={itemsPerPage} onChange={setItemsPerPage} />
                </div>
                <div className="flex gap-2">
                  {view === "card" && <CardFilter onFilterChange={setCardFilters} />}
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
                  issues={issues}
                  onIssueClick={handleSelectIssue}
                />
              )}
            </div>
            
            {/* Pagination */}
            {paginationInfo && (
              <div className="mt-6 px-4">
                <Pagination
                  currentPage={paginationInfo.page}
                  hasNext={paginationInfo.has_next}
                  hasPrev={paginationInfo.has_prev}
                  onPageChange={handlePageChange}
                  totalIssues={paginationInfo.count}
                  totalFetched={paginationInfo.total_fetched}
                  pagesFetched={paginationInfo.pages_fetched}
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
