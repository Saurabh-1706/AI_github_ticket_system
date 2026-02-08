/**
 * Service for streaming issues progressively from the backend.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface StreamedIssue {
  type: "issue";
  data: any;
}

export interface StreamComplete {
  type: "complete";
  pagination: any;
}

export interface StreamStart {
  type: "start";
  page: number;
  per_page: number;
}

export interface StreamError {
  type: "error";
  error: string;
}

type StreamMessage = StreamedIssue | StreamComplete | StreamStart | StreamError;

/**
 * Fetch issues with progressive streaming
 */
export async function streamIssues(
  owner: string,
  repo: string,
  userToken: string | undefined,
  page: number,
  onIssue: (issue: any) => void,
  onComplete: (pagination: any) => void,
  onError: (error: string) => void
) {
  const url = new URL(`${API_BASE}/api/github/issues/${owner}/${repo}/stream`);
  if (userToken) {
    url.searchParams.append("user_token", userToken);
  }
  url.searchParams.append("page", page.toString());
  url.searchParams.append("per_page", "30");

  console.log("🌐 Streaming from URL:", url.toString());

  try {
    const response = await fetch(url.toString());

    console.log("📡 Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ HTTP error response:", errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message: StreamMessage = JSON.parse(line);

            switch (message.type) {
              case "start":
                console.log("Stream started:", message);
                break;
              case "issue":
                onIssue(message.data);
                break;
              case "complete":
                onComplete(message.pagination);
                break;
              case "error":
                onError(message.error);
                break;
            }
          } catch (e) {
            console.error("Failed to parse stream message:", line, e);
          }
        }
      }
    }
  } catch (error) {
    console.error("Stream error:", error);
    onError(error instanceof Error ? error.message : "Unknown error");
  }
}
