"use client";

import { useState } from "react";

type Node = {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url?: string;
};

type Props = {
  repo: string;
  token: string;
  path?: string;
  onFileSelect: (file: {
    name: string;
    path: string;
    url: string;
  }) => void;
};

export default function RepoTree({
  repo,
  token,
  path = "",
  onFileSelect,
}: Props) {
  const [items, setItems] = useState<Node[] | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (items) {
      setOpen(!open);
      return;
    }

    const res = await fetch(
      `/api/github/contents?repo=${repo}&path=${path}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await res.json();
    setItems(data.contents);
    setOpen(true);
  };

  return (
    <div className="ml-2">
      <button
        onClick={load}
        className="flex items-center gap-2 text-sm font-medium hover:underline"
      >
        {open ? "📂" : "📁"} {path || "Root"}
      </button>

      {open &&
        items?.map((item) => (
          <div key={item.path} className="ml-4 mt-1">
            {item.type === "dir" ? (
              <RepoTree
                repo={repo}
                token={token}
                path={item.path}
                onFileSelect={onFileSelect}
              />
            ) : (
              <button
                onClick={() =>
                  onFileSelect({
                    name: item.name,
                    path: item.path,
                    url: item.download_url!,
                  })
                }
                className="block text-left text-sm text-blue-600 hover:underline dark:text-blue-400"
              >
                📄 {item.name}
              </button>
            )}
          </div>
        ))}
    </div>
  );
}
