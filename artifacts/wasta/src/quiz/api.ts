export class ApiError extends Error {
  constructor(public status: number, public code?: string) { super(`Request failed (${status})`); }
}

// Never turn a failed live mutation into a successful mock response.
export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined || body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(20_000),
    credentials: "same-origin",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { code?: string } | null;
    throw new ApiError(response.status, typeof error?.code === "string" ? error.code : undefined);
  }
  return response.json() as Promise<T>;
}
