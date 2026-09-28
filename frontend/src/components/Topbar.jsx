import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { ICON, initials } from "../icons";

export default function Topbar({ breadcrumb, search, onSearch, onBellClick }) {
  const { user, model, setModel, logout, segments, call } = useApp();
  const [bellCount, setBellCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let n = 0;
      try {
        if (user.role === "Admin") {
          const res = await call("/api/pending-approvals");
          if (res.ok) n = (await res.json()).length;
        } else if (user.role === "Teacher") {
          n = segments.filter((s) => !s.teacher_decision).length;
        } else if (user.role === "Supervisor") {
          n = segments.filter((s) => s.teacher_decision && !s.supervisor_approved).length;
        }
      } catch { /* non-critical */ }
      if (!cancelled) setBellCount(n);
    })();
    return () => { cancelled = true; };
  }, [user.role, segments, call]);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" />
            <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
          </svg>
        </div>
        <div>
          <h1>Paper Marker</h1>
          <div className="subtitle">{breadcrumb}</div>
        </div>
      </div>
      {user.role !== "Student" && (
        <>
          <label className="topbar-search" style={{ display: onSearch ? "flex" : "none" }}>
            {ICON.search}
            <input
              type="text"
              placeholder="Search by ID or question…"
              value={search || ""}
              onChange={(e) => onSearch && onSearch(e.target.value.toLowerCase())}
            />
          </label>
          <button className="topbar-bell" title="Items needing your attention" onClick={onBellClick} type="button">
            {ICON.bell}
            {bellCount > 0 && <span className="bell-count">{bellCount > 99 ? "99+" : bellCount}</span>}
          </button>
        </>
      )}
      <div className="user-chip">
        <div className="avatar-circle">{initials(user.name)}</div>
        <div>
          <div className="user-name">{user.name}</div>
          <div className="user-role-badge">{user.role}</div>
        </div>
        <select className="model-select-inline" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="stub">Model: Stub (instant)</option>
          <option value="real">Model: qwen2.5:1.5b (real, fast)</option>
        </select>
        <button className="logout-btn" onClick={logout}>Log Out</button>
      </div>
    </header>
  );
}
