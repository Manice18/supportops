// Same-origin. Next rewrites /api and /health to the Fastify process so the
// session cookie is not split across ports.
export const API_URL = "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const match = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const csrf = readCookie("supportops_csrf");
  if (csrf) headers.set("x-csrf-token", csrf);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(`Cannot reach the API at ${API_URL}. Start it with pnpm dev.`, 0, "NETWORK");
  }

  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string; code?: string };
  } | null;
  if (!response.ok) {
    throw new ApiError(body?.error?.message ?? "Request failed.", response.status, body?.error?.code ?? "UNKNOWN");
  }
  return body as T;
}
