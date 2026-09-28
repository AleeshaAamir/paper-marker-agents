// Talks to the .NET backend (backend/) which owns auth/sessions/roles and
// proxies AI operations to ai-service/. Same API contract the old vanilla-JS
// frontend used - see backend/Program.cs.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export function loadToken() {
  return localStorage.getItem("pm_token") || sessionStorage.getItem("pm_token") || null;
}
export function saveToken(token, remember) {
  (remember ? localStorage : sessionStorage).setItem("pm_token", token);
}
export function clearToken() {
  localStorage.removeItem("pm_token");
  sessionStorage.removeItem("pm_token");
}

class UnauthenticatedError extends Error {}

/** Authenticated fetch - attaches the bearer token, throws on 401 so
 * callers can redirect to sign-in (see AuthContext). */
export async function api(path, opts = {}, token) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  if (res.status === 401) throw new UnauthenticatedError("unauthenticated");
  return res;
}

export { API_BASE, UnauthenticatedError };
