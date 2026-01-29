interface Props {
  value: number; // 0 - 100
}

export default function ConfidenceBar({ value }: Props) {
  return (
    <div className="mt-2">
      <div className="h-2 w-full bg-gray-200 rounded">
        <div
          className="h-2 rounded bg-blue-600"
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Confidence: {value}%
      </p>
    </div>
  );
}
