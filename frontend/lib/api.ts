// Tiny wrapper around `fetch` that attaches the signed-in Firebase user's
// ID token as a Bearer credential. The backend's auth dependency
// (`backend/app/auth.py`) verifies these tokens when KINETIC_AUTH_REQUIRED
// is set; in permissive mode they're decoded but optional.
//
// Usage:
//   const res = await apiFetch("/decision", { method: "POST", body });
//
// Notes:
//   - `path` may be absolute (http(s)://...) or a leading-slash path; in the
//     latter case we prepend NEXT_PUBLIC_API_BASE_URL.
//   - Setting JSON bodies still requires the caller to set
//     `Content-Type: application/json`. We don't auto-serialize.
//   - Failures to fetch a token (e.g. user signed out, network blip) are
//     non-fatal: the request goes out without an Authorization header and
//     the server decides what to do.

import { auth } from "./firebase";

const DEFAULT_BASE = "http://127.0.0.1:8000";

export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BASE;

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (!path.startsWith("/")) return `${API_BASE}/${path}`;
  return `${API_BASE}${path}`;
}

async function getBearerToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getBearerToken();

  // Merge headers without clobbering any the caller passed in.
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(resolveUrl(path), { ...init, headers });
}
