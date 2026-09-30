import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import Dashboard from "../pages/Dashboard";
import SystemOverview from "../pages/SystemOverview";
import UploadForm from "../pages/UploadForm";
import PendingApprovals from "../pages/PendingApprovals";
import SupervisorDashboard from "../pages/SupervisorDashboard";
import MarkingPage from "../pages/MarkingPage";
import StudentResults from "../pages/StudentResults";

const BREADCRUMB = {
  dashboard: "Dashboard",
  overview: "Dashboard > System Overview",
  upload: "Dashboard > Upload New Paper",
  pending: "Dashboard > Pending Registrations",
  audit: "Dashboard > Audit & Approval Queue",
  marking: "Dashboard > Marking Queue",
};

const SEARCHABLE_VIEWS = new Set(["dashboard", "audit"]);

function MarkingRoute({ onBack }) {
  const { segmentId } = useParams();
  const navigate = useNavigate();
  return <MarkingPage segmentId={segmentId} onBack={onBack} onNextPaper={(id) => navigate(`/marking/${id}`)} />;
}

export default function AppShell() {
  const { user, loadSegments } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");

  useEffect(() => { loadSegments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSearch(""); }, [location.pathname]);

  if (user.role === "Student") {
    return (
      <>
        <Topbar breadcrumb="My Results" />
        <div className="app-layout no-sidebar">
          <main className="main-content">
            <Routes>
              <Route path="/results" element={<StudentResults />} />
              <Route path="/results/:segmentId" element={<StudentResults />} />
              <Route path="*" element={<Navigate to="/results" replace />} />
            </Routes>
          </main>
        </div>
      </>
    );
  }

  const view = location.pathname.startsWith("/marking") ? "marking" : location.pathname.slice(1) || "dashboard";
  const openPaper = (segId) => navigate(`/marking/${segId}`);
  const backFromMarking = () => navigate(user.role === "Supervisor" ? "/audit" : "/dashboard");

  return (
    <>
      <Topbar
        breadcrumb={BREADCRUMB[view]}
        search={SEARCHABLE_VIEWS.has(view) ? search : undefined}
        onSearch={SEARCHABLE_VIEWS.has(view) ? setSearch : undefined}
        onBellClick={() => navigate(user.role === "Admin" ? "/pending" : user.role === "Supervisor" ? "/audit" : "/dashboard")}
      />
      <div className="app-layout">
        <Sidebar view={view} onOpenPaper={openPaper} />
        <main className="main-content">
          <Routes>
            <Route path="/dashboard" element={<Dashboard search={search} onOpenPaper={openPaper} />} />
            {user.role === "Admin" && <Route path="/overview" element={<SystemOverview />} />}
            {user.role === "Admin" && <Route path="/upload" element={<UploadForm onCancel={() => navigate("/dashboard")} onSubmitted={openPaper} />} />}
            {user.role === "Admin" && <Route path="/pending" element={<PendingApprovals />} />}
            {user.role === "Supervisor" && <Route path="/audit" element={<SupervisorDashboard search={search} onOpenPaper={openPaper} />} />}
            <Route path="/marking/:segmentId" element={<MarkingRoute onBack={backFromMarking} />} />
            <Route path="*" element={<Navigate to={user.role === "Supervisor" ? "/audit" : "/dashboard"} replace />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
