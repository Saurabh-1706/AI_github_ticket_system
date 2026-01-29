interface Props {
  classification: string;
}

const colors: any = {
  duplicate: "bg-red-100 text-red-700",
  related: "bg-yellow-100 text-yellow-700",
  new: "bg-green-100 text-green-700",
};

export default function DuplicateBadge({ classification }: Props) {
  return (
    <span
      className={`text-xs px-2 py-1 rounded font-medium ${
        colors[classification] || colors.new
      }`}
    >
      {classification.toUpperCase()}
    </span>
  );
}
