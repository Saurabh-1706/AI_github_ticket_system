interface Props {
  label: string;
  color: string;
}

export default function AnalysisBadge({ label, color }: Props) {
  return (
    <span
      className={`text-xs px-2 py-1 rounded font-medium ${color}`}
    >
      {label}
    </span>
  );
}
