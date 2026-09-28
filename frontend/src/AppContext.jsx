import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, loadToken, saveToken, clearToken, UnauthenticatedError } from "./api";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }) {
  const [token, setToken] = useState(loadToken());
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const [segments, setSegments] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [model, setModel] = useState("stub");
  const [discrepancyThreshold, setDiscrepancyThreshold] = useState(1.0);
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const toast = useCallback((message, kind = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, kind, show: false }]);
    // Two-step (add then mark shown) so the CSS transition actually plays.
    requestAnimationFrame(() =>
      setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: true } : x))), 10));
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, show: false } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 250);
    }, 3800);
  }, []);

  // Authenticated request helper - forces logout on a 401, same as the
  // original vanilla-JS api() wrapper.
  const call = useCallback(async (path, opts) => {
    try {
      return await api(path, opts, token);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        toast("Session expired - please log in again.", "error");
        logout();
      }
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (email, password, role, remember) => {
    const res = await fetch((import.meta.env.VITE_API_BASE || "http://localhost:5000") + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed.");
    }
    const data = await res.json();
    saveToken(data.token, remember);
    setToken(data.token);
    setUser({ email: data.email, role: data.role, name: data.name });
    return data;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setUser(null);
    setSegments([]);
    setActiveId(null);
  }, []);

  const loadSegments = useCallback(async () => {
    try {
      const res = await call("/api/segments");
      if (!res.ok) return;
      setSegments(await res.json());
    } catch { /* handled by call() */ }
  }, [call]);

  // Boot: fetch config, then try to resume a session from a stored token.
  useEffect(() => {
    fetch((import.meta.env.VITE_API_BASE || "http://localhost:5000") + "/api/config")
      .then((r) => r.json()).then((c) => setDiscrepancyThreshold(c.discrepancy_threshold))
      .catch(() => {});

    if (!token) { setBooted(true); return; }
    (async () => {
      try {
        const res = await api("/api/me", {}, token);
        if (!res.ok) throw new Error("bad session");
        setUser(await res.json());
      } catch {
        clearToken();
        setToken(null);
      } finally {
        setBooted(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = {
    token, user, booted, segments, setSegments, activeId, setActiveId,
    model, setModel, discrepancyThreshold, toasts, toast,
    call, login, logout, loadSegments,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
