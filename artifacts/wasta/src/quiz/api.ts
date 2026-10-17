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

// Only ever send the buyer to Paymob's own HTTPS checkout.
export function openPaymobCheckout(checkoutUrl?: string): void {
  if (!checkoutUrl) throw new Error("Missing checkout URL");
  const target = new URL(checkoutUrl);
  const host = target.hostname;
  if (target.protocol !== "https:" || target.username || target.password ||
    !(host === "paymob.com" || host.endsWith(".paymob.com") || host === "paymobsolutions.com" || host.endsWith(".paymobsolutions.com"))) throw new Error("Unexpected checkout URL");
  window.location.assign(target.href);
}
