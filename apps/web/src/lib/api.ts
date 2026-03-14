import type { ApiErrorShape } from "@/lib/types";
import { getTurnstileToken, isTurnstileConfigured } from "@/lib/turnstile";

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

type RequestInitWithBody = Omit<RequestInit, "body"> & {
  body?: unknown;
};

function buildUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

export async function apiFetch<T>(path: string, options: RequestInitWithBody = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const method = (rest.method ?? "GET").toUpperCase();

  let requestBody = body;
  if (
    body !== undefined &&
    method !== "GET" &&
    method !== "HEAD" &&
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body)
  ) {
    const bodyWithToken = body as Record<string, unknown>;
    if (bodyWithToken.turnstile_token === undefined && isTurnstileConfigured()) {
      const token = await getTurnstileToken();
      if (token) {
        requestBody = {
          ...bodyWithToken,
          turnstile_token: token,
        };
      }
    }
  }

  const response = await fetch(buildUrl(path), {
    credentials: "include",
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: requestBody !== undefined ? JSON.stringify(requestBody) : undefined,
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
