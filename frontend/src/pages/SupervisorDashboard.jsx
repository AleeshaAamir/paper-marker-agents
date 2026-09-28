import { useMemo } from "react";
import { useApp } from "../AppContext";
import { ICON } from "../icons";
import { statusClass, statusLabelFor, exportCsv } from "../helpers";

export default function SupervisorDashboard({ search, onOpenPaper }) {
  const { segments, discrepancyThreshold, call, toast, loadSegments } = useApp();

  const reviewed = segments.filter((s) => s.teacher_decision);
  const pendingApproval = reviewed.filter((s) => !s.supervisor_approved);
  const flagged = reviewed.filter((s) => s.triggers_second_marking || s.teacher_decision === "flag");
  const variances = reviewed
    .filter((s) => s.ai_total != null && s.adjusted_total != null && s.max_marks)
    .map((s) => Math.abs(s.adjusted_total - s.ai_total) / s.max_marks * 100);
  const avgVariance = variances.length ? variances.reduce((a, b) => a + b, 0) / variances.length : 0;
  const auditProgress = reviewed.length ? Math.round(((reviewed.length - pendingApproval.length) / reviewed.length) * 100) : 0;
  const thresholdPct = Math.round(discrepancyThreshold * 10);

  const rowData = useMemo(() => {
    const term = (search || "").toLowerCase();
    const bySearch = (s) => !term || s.segment_id.toLowerCase().includes(term) || (s.question_text || s.question_id || "").toLowerCase().includes(term);
    return reviewed.filter(bySearch).map((s) => {
      const teacherMark = s.teacher_decision === "flag" ? null : (s.adjusted_total ?? s.ai_total);
      const aiMark = s.ai_total;
      const variance = (teacherMark != null && aiMark != null && s.max_marks)
        ? Math.round((Math.abs(teacherMark - aiMark) / s.max_marks) * 100) : null;
      const priority = variance == null ? null : variance > 15 ? "HIGH" : variance > 5 ? "MEDIUM" : "LOW";
      return { s, teacherMark, aiMark, variance, priority };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, search]);

  async function approve(segId) {
    const res = await call(`/api/supervisor-approve/${segId}`, { method: "POST" });
    if (!res.ok) { toast("Failed to approve: " + (await res.text()), "error"); return; }
    toast("Approved and finalized.", "success");
    loadSegments();
  }

  function doExport() {
    exportCsv("audit-report.csv",
      ["Segment ID", "Question", "Teacher Mark", "AI Mark", "Variance %", "Status", "Priority", "Supervisor Approved"],
      rowData.map(({ s, teacherMark, aiMark, variance, priority }) => [
        s.segment_id, s.question_text || s.question_id, teacherMark ?? "", aiMark ?? "",
        variance ?? "", statusLabelFor(s), priority ?? "", s.supervisor_approved ? "Yes" : "No",
      ]));
  }

  return (
    <>
      <div className="dash-greeting" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2>Audit &amp; Approval Queue</h2>
          <p>Review exam submissions with discrepancies between AI marking and teacher grading. Verify integrity and finalize results.</p>
        </div>
        <button className="hero-btn-ghost" style={{ borderRadius: "var(--radius-sm)" }} onClick={doExport}>&#8595; Export Report (CSV)</button>
      </div>
      <div className="stat-grid">
        <div className="stat-tile t-amber"><div className="stat-icon">{ICON.overview}</div><div className="num">{pendingApproval.length}</div><div className="label">Pending Approval</div></div>
        <div className="stat-tile t-red"><div className="stat-icon">{ICON.audit}</div><div className="num">{flagged.length}</div><div className="label">Audit Flagged</div></div>
        <div className="stat-tile t-blue"><div className="stat-icon">{ICON.dashboard}</div><div className="num">{avgVariance.toFixed(1)}%</div><div className="label">Average Variance</div></div>
        <div className="stat-tile t-green"><div className="stat-icon">{ICON.people}</div><div className="num">{auditProgress}%</div><div className="label">Audit Progress</div></div>
      </div>
      <div className="queue-table-wrap" style={{ marginBottom: 20 }}>
        <div className="queue-table-head">Reviewed Papers</div>
        {rowData.length === 0 ? <div className="empty-state">No reviewed papers match.</div> : (
          <table className="papers-table">
            <thead><tr><th>ID</th><th>Question</th><th>Teacher Mark</th><th>AI Mark</th><th>Variance</th><th>Status</th><th>Priority</th><th>Action</th></tr></thead>
            <tbody>
              {rowData.map(({ s, teacherMark, aiMark, variance, priority }) => {
                const priorityClass = priority === "HIGH" ? "status-flag" : priority === "MEDIUM" ? "status-pending" : "status-accept";
                return (
                  <tr key={s.segment_id}>
                    <td><a href="#" className="row-link" onClick={(e) => { e.preventDefault(); onOpenPaper(s.segment_id); }}><b>{s.segment_id}</b></a></td>
                    <td dir="auto">{s.question_text || s.question_id}</td>
                    <td>{teacherMark ?? "—"}</td>
                    <td>{aiMark ?? "—"}</td>
                    <td>{variance == null ? "—" : variance + "%"}</td>
                    <td><span className={`badge ${statusClass(s)}`}>{statusLabelFor(s)}</span></td>
                    <td>{priority ? <span className={`badge ${priorityClass}`}>{priority}</span> : "—"}</td>
                    <td>
                      {s.supervisor_approved
                        ? <span className="confidence-pill">&#10003; Approved</span>
                        : <button className="action-btn" onClick={() => approve(s.segment_id)}>Approve</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="info-callout" style={{ marginBottom: 0 }}>
        <span className="info-callout-icon">&#9888;&#65039;</span>
        <div>
          <b>Supervisor Guideline: High-Variance Protocol.</b> A teacher adjustment that differs from the AI's mark by
          more than {discrepancyThreshold} mark(s) automatically triggers second-marking (this app's real{" "}
          <code>DISCREPANCY_THRESHOLD</code> config, roughly {thresholdPct}% on a typical question) &mdash; those are
          the papers marked HIGH priority above.
        </div>
      </div>
    </>
  );
}
