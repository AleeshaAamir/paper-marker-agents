import { useEffect, useState } from "react";
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

export default function AppShell() {
  const { user, loadSegments } = useApp();
  const [view, setView] = useState(user.role === "Supervisor" ? "audit" : "dashboard");
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => { loadSegments(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (user.role === "Student") {
    return (
      <>
        <Topbar breadcrumb="My Results" />
        <div className="app-layout no-sidebar">
          <main className="main-content"><StudentResults /></main>
        </div>
      </>
    );
  }

  function nav(v) {
    setSearch("");
    setView(v);
  }
  function openPaper(segId) {
    setActiveSegmentId(segId);
    setView("marking");
  }
  function backFromMarking() {
    setView(user.role === "Supervisor" ? "audit" : "dashboard");
  }

  return (
    <>
      <Topbar
        breadcrumb={BREADCRUMB[view]}
        search={SEARCHABLE_VIEWS.has(view) ? search : undefined}
        onSearch={SEARCHABLE_VIEWS.has(view) ? setSearch : undefined}
        onBellClick={() => nav(user.role === "Admin" ? "pending" : user.role === "Supervisor" ? "audit" : "dashboard")}
      />
      <div className="app-layout">
        <Sidebar view={view} onNav={nav} onOpenPaper={openPaper} />
        <main className="main-content">
          {view === "dashboard" && <Dashboard search={search} onOpenPaper={openPaper} />}
          {view === "overview" && <SystemOverview />}
          {view === "upload" && <UploadForm onCancel={() => nav("dashboard")} onSubmitted={openPaper} />}
          {view === "pending" && <PendingApprovals />}
          {view === "audit" && <SupervisorDashboard search={search} onOpenPaper={openPaper} />}
          {view === "marking" && activeSegmentId && (
            <MarkingPage segmentId={activeSegmentId} onBack={backFromMarking} onNextPaper={openPaper} />
          )}
        </main>
      </div>
    </>
  );
}
