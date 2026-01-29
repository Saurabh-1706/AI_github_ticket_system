import RepoInput from "./components/RepoInput";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-3xl">
        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          
          {/* App Name */}
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Git IntelliSolve
          </h1>

          {/* Tagline */}
          <p className="mt-3 max-w-xl text-zinc-600 dark:text-zinc-400">
            AI-powered GitHub issue analysis. Detect duplicates, analyze
            criticality, and reuse proven solutions — instantly.
          </p>

          {/* Input Section */}
          <div className="mt-8">
            <RepoInput />
          </div>

          {/* Footer hint */}
          <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
            Example: https://github.com/facebook/react
          </p>
        </div>
      </div>
    </main>
  );
}
