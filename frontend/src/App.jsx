import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useApp } from "./AppContext";
import ToastContainer from "./components/ToastContainer";
import AppShell from "./components/AppShell";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";

function defaultRouteFor(role) {
  if (role === "Student") return "/results";
  if (role === "Supervisor") return "/audit";
  return "/dashboard";
}

export default function App() {
  const { booted, user } = useApp();
  const navigate = useNavigate();

  if (!booted) {
    return <div className="loading" style={{ padding: 60 }}><span className="spinner"></span>Loading...</div>;
  }

  return (
    <>
      <div id="app-root">
        <Routes>
          {user ? (
            <>
              <Route path="/*" element={<AppShell />} />
              <Route path="/" element={<Navigate to={defaultRouteFor(user.role)} replace />} />
              <Route path="/signin" element={<Navigate to={defaultRouteFor(user.role)} replace />} />
              <Route path="/signup" element={<Navigate to={defaultRouteFor(user.role)} replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Landing onSignIn={() => navigate("/signin")} onSignUp={() => navigate("/signup")} />} />
              <Route path="/signin" element={<SignIn onBackHome={() => navigate("/")} onGoRegister={() => navigate("/signup")} />} />
              <Route path="/signup" element={<SignUp onBackHome={() => navigate("/")} onGoLogin={() => navigate("/signin")} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </div>
      <ToastContainer />
    </>
  );
}
