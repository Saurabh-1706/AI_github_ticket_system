/**
 * Authentication service for API calls.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  full_name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    full_name?: string;
    avatar_url?: string;
    oauth_providers: string[];
    created_at: string;
    is_verified: boolean;
  };
}

/**
 * Register a new user with email/password
 */
export async function registerUser(data: RegisterData): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Registration failed");
  }

  return response.json();
}

/**
 * Login with email/password
 */
export async function loginUser(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Login failed");
  }

  return response.json();
}

/**
 * Logout current user
 */
export async function logoutUser(token: string): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Get current user info
 */
export async function getCurrentUser(token: string): Promise<AuthResponse["user"]> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get user info");
  }

  return response.json();
}

/**
 * Initiate Google OAuth flow
 */
export async function initiateGoogleOAuth(): Promise<{ auth_url: string; state: string }> {
  const response = await fetch(`${API_BASE}/api/auth/google`);
  return response.json();
}

/**
 * Initiate GitHub OAuth flow
 */
export async function initiateGitHubOAuth(): Promise<{ auth_url: string; state: string }> {
  const response = await fetch(`${API_BASE}/api/auth/github`);
  return response.json();
}

/**
 * Store auth token in localStorage
 */
export function storeAuthToken(token: string): void {
  localStorage.setItem("auth_token", token);
}

/**
 * Get auth token from localStorage
 */
export function getAuthToken(): string | null {
  return localStorage.getItem("auth_token");
}

/**
 * Remove auth token from localStorage
 */
export function removeAuthToken(): void {
  localStorage.removeItem("auth_token");
}

/**
 * Store user data in localStorage
 */
export function storeUserData(user: AuthResponse["user"]): void {
  localStorage.setItem("user_data", JSON.stringify(user));
}

/**
 * Get user data from localStorage
 */
export function getUserData(): AuthResponse["user"] | null {
  const data = localStorage.getItem("user_data");
  return data ? JSON.parse(data) : null;
}

/**
 * Remove user data from localStorage
 */
export function removeUserData(): void {
  localStorage.removeItem("user_data");
}
