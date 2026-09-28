import { useEffect, useState } from "react";
import { useApp } from "../AppContext";

export default function PendingApprovals() {
  const { call, toast } = useApp();
  const [list, setList] = useState(null);

  async function load() {
    const res = await call("/api/pending-approvals");
    setList(await res.json());
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(email, action) {
    const res = await call(`/api/${action}/${encodeURIComponent(email)}`, { method: "POST" });
    if (!res.ok) { toast(`Failed to ${action}: ` + (await res.text()), "error"); return; }
    toast(`${action === "approve" ? "Approved" : "Rejected"} ${email}`, "success");
    load();
  }

  if (list === null) return <div className="loading"><span className="spinner"></span>Loading pending registrations...</div>;

  return (
    <>
      <div className="dash-greeting"><h2>Pending Registrations</h2><p>Teacher accounts require Admin approval before they can log in (scope doc 6.1).</p></div>
      <div className="pending-table-wrap">
        {list.length === 0 ? (
          <div className="empty-state">No pending registrations.</div>
        ) : (
          <table className="papers-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.email}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td><span className="badge lang-en">{u.role}</span></td>
                  <td>
                    <button className="approve-btn" onClick={() => act(u.email, "approve")}>Approve</button>
                    <button className="reject-btn" onClick={() => act(u.email, "reject")}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
