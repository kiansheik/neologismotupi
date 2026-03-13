import type { ApiErrorShape } from "@/lib/types";

export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(message: string, code = "api_error", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

interface RequestInitWithBody extends RequestInit {
  body?: unknown;
}

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

export async function apiFetch<T>(path: string, options: RequestInitWithBody = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  const response = await fetch(buildUrl(path), {
    credentials: "include",
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let parsed: ApiErrorShape | null = null;
    try {
      parsed = (await response.json()) as ApiErrorShape;
    } catch {
      parsed = null;
    }

    const error = parsed?.error;
    throw new ApiError(error?.message ?? "Request failed", error?.code ?? "http_error", error?.details);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function withQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  const url = new URL(buildUrl(path));
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}
