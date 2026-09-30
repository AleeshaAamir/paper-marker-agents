import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { ICON } from "../icons";
import { statusClass, statusLabelFor, dashboardBucket } from "../helpers";

export default function Dashboard({ search, onOpenPaper }) {
  const { user, segments, call, toast, loadSegments } = useApp();
  const isAdmin = user.role === "Admin";
  const [tab, setTab] = useState("active");
  const [teachers, setTeachers] = useState([]);

  useEffect(() => {
    if (!isAdmin) return;
    call("/api/teachers").then((r) => r.ok && r.json()).then((list) => list && setTeachers(list)).catch(() => {});
  }, [isAdmin, call]);

  const total = segments.length;
  const pending = segments.filter((s) => !s.teacher_decision).length;
  const flagged = segments.filter((s) => dashboardBucket(s) === "flagged").length;
  const submitted = segments.filter((s) => s.teacher_decision === "accept" || s.teacher_decision === "adjust").length;
  const nextUndecided = segments.find((s) => !s.teacher_decision);

  const term = (search || "").toLowerCase().trim();
  const rows = useMemo(() => {
    const bySearch = (s) => !term || s.segment_id.toLowerCase().includes(term) || (s.question_text || s.question_id || "").toLowerCase().includes(term);
    // While actively searching, look across every tab - a paper you're
    // searching for by ID might already be in "Recently Completed", not
    // whichever tab happens to be selected, and "search finds nothing"
    // is a worse experience than "search ignores the tab filter."
    const byTab = (s) => term || dashboardBucket(s) === tab;
    return segments.filter(byTab).filter(bySearch);
  }, [segments, tab, term]);

  async function assign(segId, teacherEmail) {
    const res = await call(`/api/assign/${segId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacher_email: teacherEmail || null }),
    });
    if (!res.ok) { toast("Failed to assign: " + (await res.text()), "error"); return; }
    const teacherName = (teachers.find((t) => t.email === teacherEmail) || {}).name;
    toast(teacherEmail ? `Assigned to ${teacherName || teacherEmail}` : "Unassigned", "success");
    loadSegments();
  }

  return (
    <>
      <div className="dash-greeting" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>Good morning, {user.name}</h2>
          <p>{isAdmin ? `System overview · ${pending} paper(s) awaiting teacher review.` : `You have ${pending} paper(s) pending review.`}</p>
        </div>
        {nextUndecided && <button className="primary" onClick={() => onOpenPaper(nextUndecided.segment_id)}>Mark Next Paper &rarr;</button>}
      </div>
      <div className="stat-grid">
        <div className="stat-tile t-blue"><div className="stat-icon">{ICON.dashboard}</div><div className="num">{total}</div><div className="label">{isAdmin ? "Papers in System" : "Assigned Papers"}</div></div>
        <div className="stat-tile t-amber"><div className="stat-icon">{ICON.overview}</div><div className="num">{pending}</div><div className="label">Pending Review</div></div>
        <div className="stat-tile t-red"><div className="stat-icon">{ICON.audit}</div><div className="num">{flagged}</div><div className="label">Flagged</div></div>
        <div className="stat-tile t-green"><div className="stat-icon">{ICON.people}</div><div className="num">{submitted}</div><div className="label">Submitted</div></div>
      </div>
      <div className="queue-table-wrap">
        <div className="queue-table-head">{isAdmin ? "All Papers - System-wide Overview" : "My Assigned Papers"}</div>
        <div style={{ padding: "14px 18px 0" }}>
          <div className="tab-row">
            <button className={`tab-btn${tab === "active" ? " active" : ""}`} onClick={() => setTab("active")}>Active Queue</button>
            <button className={`tab-btn${tab === "flagged" ? " active" : ""}`} onClick={() => setTab("flagged")}>Flagged for Review</button>
            <button className={`tab-btn${tab === "completed" ? " active" : ""}`} onClick={() => setTab("completed")}>Recently Completed</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="empty-state">No papers in this view.</div>
        ) : (
          <table className="papers-table">
            <thead>
              <tr>
                <th>Segment ID</th><th>Question</th><th>Lang</th><th>Status</th>
                {isAdmin && <th>Assigned To</th>}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((seg) => (
                <tr key={seg.segment_id}>
                  <td><b>{seg.segment_id}</b></td>
                  <td dir="auto">{seg.question_text || seg.question_id}</td>
                  <td><span className={`badge lang-${seg.language}`}>{seg.language.toUpperCase()}</span></td>
                  <td><span className={`badge ${statusClass(seg)}`}>{statusLabelFor(seg)}</span></td>
                  {isAdmin && (
                    <td>
                      <select className="assign-select" value={seg.assigned_to || ""} onChange={(e) => assign(seg.segment_id, e.target.value)}>
                        <option value="">Unassigned</option>
                        {teachers.map((t) => <option key={t.email} value={t.email}>{t.name}</option>)}
                      </select>
                    </td>
                  )}
                  <td><button className="action-btn" onClick={() => onOpenPaper(seg.segment_id)}>
                    {seg.triggers_second_marking ? "REVW" : seg.teacher_decision ? "VIEW" : "MARK"}
                  </button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
