const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : typeof payload === "string" && payload.trim().length > 0
          ? payload
          : `API Error: ${response.status}`;
    throw new Error(errorMessage);
  }

  return payload as T;
}

export interface ApiStreamEvent<T> {
  event: string;
  data: T;
}

async function streamApi<T>(
  endpoint: string,
  data: unknown,
  onEvent: (event: ApiStreamEvent<T>) => void
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `API Error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const lines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const eventLine = lines.find((line) => line.startsWith("event:"));
      const dataLine = lines.find((line) => line.startsWith("data:"));
      if (!dataLine) {
        continue;
      }

      const event = eventLine?.slice("event:".length).trim() || "message";
      const payload = JSON.parse(dataLine.slice("data:".length).trim()) as T;
      onEvent({ event, data: payload });
    }
  }
}

export const api = {
  get: <T>(endpoint: string) => fetchApi<T>(endpoint),
  post: <T>(endpoint: string, data: unknown) =>
    fetchApi<T>(endpoint, { method: "POST", body: JSON.stringify(data) }),
  streamPost: <T>(
    endpoint: string,
    data: unknown,
    onEvent: (event: ApiStreamEvent<T>) => void
  ) => streamApi(endpoint, data, onEvent),
  put: <T>(endpoint: string, data: unknown) =>
    fetchApi<T>(endpoint, { method: "PUT", body: JSON.stringify(data) }),
  delete: <T>(endpoint: string) =>
    fetchApi<T>(endpoint, { method: "DELETE" }),
};
