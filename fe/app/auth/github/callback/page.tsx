"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentUser } from "../../../services/auth";
import { useAuth } from "../../../components/AuthProvider";

function GitHubCallbackPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing GitHub authentication...");

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get("code");
      const state = searchParams.get("state");
      const token = searchParams.get("token");
      const error = searchParams.get("error");
      
      // Debug logging
      console.log("🔍 GitHub Callback - URL:", window.location.href);
      console.log("🔍 Code:", code);
      console.log("🔍 State:", state);
      console.log("🔍 Token:", token);
      console.log("🔍 Error:", error);

      if (error) {
        console.error("❌ OAuth error:", error);
        setStatus("error");
        setMessage(`Authentication failed: ${error}`);
        setTimeout(() => router.push("/login"), 3000);
        return;
      }

      // If we have a code, we need to exchange it for a token via backend
      if (code && state) {
        console.log("📤 Exchanging code for token via backend...");
        try {
          // Call backend POST endpoint to exchange code for token
          const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const response = await fetch(
            `${API_BASE}/api/auth/github/exchange?code=${code}&state=${state}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
            throw new Error(errorData.detail || `HTTP ${response.status}`);
          }

          const data = await response.json();
          const tokenFromBackend = data.access_token;

          if (!tokenFromBackend) {
            throw new Error("No token received from backend");
          }

          const user = await getCurrentUser(tokenFromBackend);

          // Persist + update AuthProvider state atomically
          login(tokenFromBackend, user);

          setStatus("success");
          setMessage("GitHub authentication successful! Redirecting...");
          router.push("/");
          return;
          
        } catch (err) {
          console.error("❌ Backend exchange failed:", err);
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Failed to authenticate with GitHub");
          setTimeout(() => router.push("/login"), 3000);
          return;
        }
      }

      // If we already have a token (from direct backend redirect)
      if (token) {
        try {
          const user = await getCurrentUser(token);
          login(token, user);
          setStatus("success");
          setMessage("GitHub authentication successful! Redirecting...");
          router.push("/");
        } catch (err) {
          setStatus("error");
          setMessage("Failed to retrieve user information");
          setTimeout(() => router.push("/login"), 3000);
        }
        return;
      }

      // No code, state, or token found
      console.error("❌ No authentication data found in URL");
      setStatus("error");
      setMessage("No authentication data received");
      setTimeout(() => router.push("/login"), 3000);
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="text-center">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
            <p className="text-zinc-600 dark:text-zinc-400">{message}</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <svg className="h-6 w-6 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-zinc-900 dark:text-white font-medium">{message}</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-600 dark:text-red-400">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
        <div className="text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-800 dark:border-t-white" />
            <p className="text-zinc-600 dark:text-zinc-400">Processing GitHub authentication...</p>
          </div>
        </div>
      </div>
    }>
      <GitHubCallbackPageContent />
    </Suspense>
  );
}
