"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { storeAuthToken, storeUserData, getCurrentUser } from "../../../services/auth";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processing Google authentication...");

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      if (error) {
        console.error("❌ Google OAuth error:", error);
        setStatus("error");
        setMessage(`Authentication failed: ${error}`);
        setTimeout(() => router.push("/login"), 2000);
        return;
      }

      if (code && state) {
        console.log("📤 Exchanging code for token via backend...");
        try {
          const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
          const response = await fetch(
            `${API_BASE}/api/auth/google/exchange?code=${code}&state=${state}`,
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

          console.log("✅ Token received from backend");
          
          // Store the token
          storeAuthToken(tokenFromBackend);
          console.log("💾 Token stored in localStorage");

          // Get user data
          const user = await getCurrentUser(tokenFromBackend);
          storeUserData(user);
          console.log("💾 User data stored:", user);

          setStatus("success");
          setMessage("Google authentication successful! Redirecting...");
          
          // Redirect to home page
          setTimeout(() => router.push("/"), 1000);
          return;
        } catch (err) {
          console.error("❌ Backend exchange failed:", err);
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Authentication failed");
          setTimeout(() => router.push("/login"), 2000);
          return;
        }
      }

      setStatus("error");
      setMessage("Missing authentication parameters");
      setTimeout(() => router.push("/login"), 2000);
    };

    handleCallback();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-black">
      <div className="rounded-2xl border border-zinc-200 bg-white/80 p-8 shadow-xl backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="text-center">
          {status === "loading" && (
            <div className="mb-4">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-700 dark:border-t-white"></div>
            </div>
          )}
          {status === "success" && (
            <div className="mb-4 text-4xl">✅</div>
          )}
          {status === "error" && (
            <div className="mb-4 text-4xl">❌</div>
          )}
          <p className="text-lg font-medium text-zinc-900 dark:text-white">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
