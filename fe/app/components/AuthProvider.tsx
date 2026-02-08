"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getAuthToken, getUserData, removeAuthToken, removeUserData, getCurrentUser } from "../services/auth";

interface User {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  oauth_providers: string[];
  created_at: string;
  is_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, userData: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing auth on mount
    const initAuth = async () => {
      const token = getAuthToken();
      const userData = getUserData();

      console.log("🔐 AuthProvider init - Token:", token ? "exists" : "none");
      console.log("🔐 AuthProvider init - UserData:", userData);

      if (token && userData) {
        setUser(userData);
        
        // Optionally verify token is still valid
        try {
          console.log("🔄 Verifying token with backend...");
          const freshUserData = await getCurrentUser(token);
          console.log("✅ Token valid, user data refreshed");
          setUser(freshUserData);
        } catch (err) {
          // Token expired or invalid
          console.warn("⚠️ Token verification failed:", err);
          console.log("🔄 Keeping cached user data, token might still be valid");
          // Don't auto-logout on initial load - keep cached data
          // The token will be validated on next API call
        }
      }
      
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = (token: string, userData: User) => {
    setUser(userData);
  };

  const logout = () => {
    removeAuthToken();
    removeUserData();
    setUser(null);
  };

  const refreshUser = async () => {
    const token = getAuthToken();
    if (token) {
      try {
        const freshUserData = await getCurrentUser(token);
        setUser(freshUserData);
      } catch (err) {
        logout();
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
