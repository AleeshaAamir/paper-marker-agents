import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { ICON } from "../icons";

const pct = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));

export default function SystemOverview() {
  const { segments, call } = useApp();
  const [teachers, setTeachers] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      call("/api/teachers").then((r) => r.ok ? r.json() : []).catch(() => []),
      call("/api/pending-approvals").then((r) => r.ok ? r.json() : []).catch(() => []),
      call("/api/activity").then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([t, p, a]) => { setTeachers(t); setPendingApprovals(p); setActivity(a); setLoading(false); });
  }, [call]);

  if (loading) return <div className="loading"><span className="spinner"></span>Loading system overview...</div>;

  const total = segments.length;
  const decided = segments.filter((s) => s.teacher_decision);
  const awaitingDecision = total - decided.length;
  const supervisorApproved = decided.filter((s) => s.supervisor_approved).length;
  const secondMarking = decided.filter((s) => s.triggers_second_marking).length;
  const liveSegments = segments.filter((s) => s.source === "live");

  return (
    <>
      <div className="dash-greeting">
        <h2>System Overview</h2>
        <p>Real, currently-tracked numbers for this session &mdash; no simulated infrastructure metrics.</p>
      </div>
      <div className="stat-grid">
        <div className="stat-tile t-blue"><div className="stat-icon">{ICON.dashboard}</div><div className="num">{total}</div><div className="label">Total Papers</div></div>
        <div className="stat-tile t-green"><div className="stat-icon">{ICON.people}</div><div className="num">{teachers.length}</div><div className="label">Active Teachers</div></div>
        <div className="stat-tile t-amber"><div className="stat-icon">{ICON.people}</div><div className="num">{pendingApprovals.length}</div><div className="label">Pending Approvals</div></div>
        <div className="stat-tile t-red"><div className="stat-icon">{ICON.overview}</div><div className="num">{awaitingDecision}</div><div className="label">Papers Awaiting Decision</div></div>
      </div>

      <div className="queue-table-wrap" style={{ padding: "18px 20px", marginBottom: 20 }}>
        <div className="queue-table-head" style={{ padding: "0 0 14px" }}>Marking Progress</div>
        <div className="progress-row">
          <div className="progress-row-head"><span>Decided</span><b>{pct(decided.length, total)}%</b></div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${pct(decided.length, total)}%` }}></div></div>
        </div>
        <div className="progress-row">
          <div className="progress-row-head"><span>Supervisor-Approved (of decided)</span><b>{pct(supervisorApproved, decided.length)}%</b></div>
          <div className="progress-track"><div className="progress-fill t-green" style={{ width: `${pct(supervisorApproved, decided.length)}%` }}></div></div>
        </div>
        <div className="progress-row" style={{ marginBottom: 0 }}>
          <div className="progress-row-head"><span>Second-Marking Triggered (of decided)</span><b>{pct(secondMarking, decided.length)}%</b></div>
          <div className="progress-track"><div className="progress-fill t-red" style={{ width: `${pct(secondMarking, decided.length)}%` }}></div></div>
        </div>
      </div>

      <div className="queue-table-wrap" style={{ marginBottom: 20 }}>
        <div className="queue-table-head">Teacher Workload</div>
        {teachers.length === 0 ? <div className="empty-state">No approved Teacher accounts yet.</div> : (
          <table className="papers-table">
            <thead><tr><th>Teacher</th><th>Assigned</th><th>Decided</th><th>Completion</th></tr></thead>
            <tbody>
              {teachers.map((t) => {
                const assigned = liveSegments.filter((s) => s.assigned_to === t.email);
                const done = assigned.filter((s) => s.teacher_decision).length;
                const completion = pct(done, assigned.length);
                return (
                  <tr key={t.email}>
                    <td><b>{t.name}</b><br /><span className="confidence-pill">{t.email}</span></td>
                    <td>{assigned.length}</td>
                    <td>{done}</td>
                    <td style={{ minWidth: 140 }}>
                      <div className="progress-track"><div className="progress-fill t-green" style={{ width: `${completion}%` }}></div></div>
                      <div className="confidence-pill">{completion}%</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="queue-table-wrap">
        <div className="queue-table-head">Recent Activity</div>
        {activity.length === 0 ? <div className="empty-state">No activity recorded yet this session.</div> : (
          <table className="papers-table">
            <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>
              {activity.map((a, i) => (
                <tr key={i}>
                  <td><span className="confidence-pill">{a.at}</span></td>
                  <td>{a.actor}</td>
                  <td>{a.action}</td>
                  <td dir="auto">{a.detail || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
