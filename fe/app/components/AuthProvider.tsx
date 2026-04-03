"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import {
  getAuthToken,
  getUserData,
  removeAuthToken,
  removeUserData,
  storeAuthToken,
  storeUserData,
  getCurrentUser,
} from "../services/auth";

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
    // Restore auth state from localStorage synchronously — no network call.
    // The JWT will be validated naturally on the first real API call.
    const token = getAuthToken();
    const userData = getUserData();
    if (token && userData) {
      setUser(userData);
    }
    setIsLoading(false);
  }, []);

  const login = (token: string, userData: User) => {
    // Persist immediately so page refreshes and OAuth redirects always work.
    storeAuthToken(token);
    storeUserData(userData);
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
