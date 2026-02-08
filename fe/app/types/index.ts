/**
 * TypeScript type definitions for the application.
 */

// ============================================================================
// GitHub Types
// ============================================================================

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string;
  private: boolean;
  created_at: string;
  updated_at: string;
}

export interface Label {
  name: string;
  color: string;
  description?: string;
}

// ============================================================================
// Issue Types
// ============================================================================

export interface Issue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  category?: string;
  created_at?: string;
  updated_at?: string;
  ai_analysis?: AIAnalysis;
  duplicate_info?: DuplicateInfo;
  similar_issues?: SimilarIssue[];
}

export interface AIAnalysis {
  type: string;
  criticality: string;
  confidence: number;
  similar_issues?: SimilarIssue[];
  solution?: string;
}

export interface DuplicateInfo {
  classification: "duplicate" | "related" | "new" | "unknown";
  similarity: number;
  reuse_type: string;
}

export interface SimilarIssue {
  number: number;
  title: string;
  similarity: number;
  id?: number;
  body?: string;
}

// ============================================================================
// Category Types
// ============================================================================

export type CategoryType =
  | "bug"
  | "feature"
  | "documentation"
  | "security"
  | "performance"
  | "question"
  | "dependency"
  | "testing"
  | "refactor"
  | "general";

export interface CategoryInfo {
  primary_category: CategoryType;
  categories: CategoryType[];
  confidence: number;
  scores: Record<string, number>;
}

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationInfo {
  page: number;
  per_page: number;
  has_next: boolean;
  has_prev: boolean;
  count: number;
  total_fetched?: number;
  pages_fetched?: number;
}

export interface PaginatedResponse<T> {
  total: number;
  items: T[];
  pagination: PaginationInfo;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface IssuesResponse {
  total: number;
  issues: Issue[];
  pagination: PaginationInfo;
}

export interface RepoAccessResponse {
  is_private: boolean;
  has_access: boolean;
  requires_auth: boolean;
  repo_exists: boolean;
}

export interface OAuthStatusResponse {
  authenticated: boolean;
  username?: string;
  github_user_id?: number;
}

export interface UserTokenResponse {
  access_token: string;
  username: string;
  github_user_id: number;
}

// ============================================================================
// Error Types
// ============================================================================

export interface APIError {
  error: string;
  detail?: string;
  status_code: number;
  path?: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface IssueCardProps {
  issue: Issue;
  onSelect: (issue: Issue) => void;
  onSelectSimilar?: (issue: Issue) => void;
}

export interface IssueDetailProps {
  issue: Issue | null;
  onClose: () => void;
  onSelectSimilar?: (issue: Issue) => void;
}

export interface PaginationProps {
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
  onPageChange: (page: number) => void;
  totalIssues?: number;
}
