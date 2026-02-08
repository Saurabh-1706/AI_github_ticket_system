"use client";

import { useState } from "react";

interface PrivateRepoAuthProps {
  owner: string;
  repo: string;
  onAuthComplete?: () => void;
}

export default function PrivateRepoAuth({
  owner,
  repo,
  onAuthComplete,
}: PrivateRepoAuthProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAuthorize = () => {
    setIsLoading(true);
    
    // Get current URL for redirect back after OAuth
    const redirectUri = window.location.href;
    
    // Redirect to backend OAuth endpoint
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    window.location.href = `${apiUrl}/api/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  return (
    <div className="rounded-xl border-2 border-yellow-200 bg-yellow-50 p-6 dark:border-yellow-800 dark:bg-yellow-900/20">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <svg
            className="h-6 w-6 text-yellow-600 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">
            🔒 Private Repository
          </h3>
          <p className="mt-2 text-sm text-yellow-800 dark:text-yellow-200">
            <strong>{owner}/{repo}</strong> is a private repository. To analyze
            its issues, you need to grant access to your GitHub account.
          </p>

          <div className="mt-4 space-y-2 text-sm text-yellow-700 dark:text-yellow-300">
            <p>✓ We'll only request read access to your repositories</p>
            <p>✓ Your access token is stored securely</p>
            <p>✓ You can revoke access anytime</p>
          </div>

          <button
            onClick={handleAuthorize}
            disabled={isLoading}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-yellow-600 px-6 py-3 font-medium text-white transition hover:bg-yellow-700 disabled:opacity-50 dark:bg-yellow-500 dark:hover:bg-yellow-600"
          >
            {isLoading ? (
              <>
                <svg
                  className="h-5 w-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Redirecting...
              </>
            ) : (
              <>
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Grant Access via GitHub
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
