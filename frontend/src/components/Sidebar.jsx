import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { ICON, initials } from "../icons";
import { statusClass, statusLabelFor } from "../helpers";

const NAV_BY_ROLE = {
  Admin: [
    { id: "dashboard", label: "Dashboard", icon: ICON.dashboard },
    { id: "overview", label: "System Overview", icon: ICON.overview },
    { id: "upload", label: "Upload New Paper", icon: ICON.upload },
    { id: "pending", label: "Pending Registrations", icon: ICON.people, badge: true },
  ],
  Teacher: [{ id: "dashboard", label: "Dashboard", icon: ICON.dashboard }],
  Supervisor: [{ id: "audit", label: "Audit & Approval Queue", icon: ICON.audit }],
};

export default function Sidebar({ view, onNav, onOpenPaper }) {
  const { user, segments, activeId, logout, call } = useApp();
  const [pendingCount, setPendingCount] = useState(0);
  const isAdmin = user.role === "Admin";
  const navItems = NAV_BY_ROLE[user.role] || [];

  useEffect(() => {
    if (!isAdmin) return;
    call("/api/pending-approvals").then((r) => r.ok && r.json()).then((list) => {
      if (list) setPendingCount(list.length);
    }).catch(() => {});
  }, [isAdmin, call, view]);

  const sidebarLabel = isAdmin ? "All Papers" : user.role === "Supervisor" ? "Reviewed Papers" : "My Assigned Papers";

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-nav-item${view === item.id ? " active" : ""}`}
            onClick={() => onNav(item.id)}
          >
            {item.icon}<span>{item.label}</span>
            {item.badge && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-label">{sidebarLabel}</div>
      <div className="queue-list">
        {segments.length === 0 ? (
          <div className="empty-state">No papers yet. Upload one to get started.</div>
        ) : (
          segments.map((seg) => (
            <div
              key={seg.segment_id}
              className={`queue-item${seg.segment_id === activeId ? " active" : ""}`}
              onClick={() => onOpenPaper(seg.segment_id)}
            >
              <div className="qid"><span>{seg.segment_id}</span><span className="qmarks">{seg.max_marks} marks</span></div>
              <div className="qsubject" dir="auto">{seg.question_text || seg.question_id}</div>
              <div className="qmeta">
                <span className={`badge lang-${seg.language}`}>{seg.language.toUpperCase()}</span>
                <span className={`badge ${statusClass(seg)}`}>{statusLabelFor(seg)}</span>
                {seg.source === "live" && <span className="badge source-live">LIVE</span>}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="sidebar-user">
        <div className="avatar-circle">{initials(user.name)}</div>
        <div>
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role">{user.role}</div>
        </div>
        <button className="sidebar-logout" title="Log out" onClick={logout}>{ICON.logout}</button>
      </div>
    </aside>
  );
}
