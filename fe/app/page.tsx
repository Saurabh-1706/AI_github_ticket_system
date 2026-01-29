import RepoInput from "./components/RepoInput";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto mt-20">
      <h1 className="text-3xl font-bold mb-6">
        Git IntelliSolve
      </h1>

      <p className="mb-4 text-gray-600">
        Paste a GitHub repository URL to analyze issues
      </p>

      <RepoInput />
    </main>
  );
}
