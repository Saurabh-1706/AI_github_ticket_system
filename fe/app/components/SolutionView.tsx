export default function SolutionView({ solution }: any) {
  return (
    <div className="bg-slate-900 text-white rounded-xl p-6 mt-6">
      <h3 className="font-semibold text-lg mb-4">
        AI Suggested Solution
      </h3>

      <pre className="text-sm bg-slate-800 p-4 rounded overflow-x-auto">
        {solution}
      </pre>

      <button className="mt-4 bg-white text-slate-900 px-4 py-2 rounded font-medium">
        Copy Code
      </button>
    </div>
  );
}
