interface Props {
  title: string;
  similarity: number;
  reuseType: string;
}

export default function SimilarIssueCard({
  title,
  similarity,
  reuseType,
}: Props) {
  return (
    <div className="border rounded p-2 bg-gray-50 text-sm">
      <p className="font-medium">{title}</p>

      <div className="flex justify-between mt-1 text-xs text-gray-600">
        <span>Similarity: {(similarity * 100).toFixed(1)}%</span>
        <span>Reuse: {reuseType}</span>
      </div>
    </div>
  );
}
