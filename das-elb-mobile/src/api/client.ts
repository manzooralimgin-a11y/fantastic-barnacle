export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status = 500, detail: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function resolveApiBaseUrl(env = process.env): string {
  const value = String(env.EXPO_PUBLIC_API_BASE_URL ?? "").trim();
  if (!value) {
    throw new ApiError("EXPO_PUBLIC_API_BASE_URL is required for Das ELB Mobile.", 500);
  }
  return value.replace(/\/+$/, "");
}

export function buildApiUrl(pathname: string, baseUrl = resolveApiBaseUrl()): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}

export async function requestJson<T>(
  pathname: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
  } = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(buildApiUrl(pathname, options.baseUrl), {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null
        ? (payload as { detail?: string; error?: string }).detail ||
          (payload as { detail?: string; error?: string }).error
        : null;
    throw new ApiError(
      String(detail || "The request could not be completed."),
      response.status,
      payload,
    );
  }

  return payload as T;
}
