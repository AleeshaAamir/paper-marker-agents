import { useState } from "react";
import { useApp } from "./AppContext";
import ToastContainer from "./components/ToastContainer";
import AppShell from "./components/AppShell";
import Landing from "./pages/Landing";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";

export default function App() {
  const { booted, user } = useApp();
  const [page, setPage] = useState("landing"); // "landing" | "signin" | "signup"

  if (!booted) {
    return <div className="loading" style={{ padding: 60 }}><span className="spinner"></span>Loading...</div>;
  }

  return (
    <>
      {user ? (
        <div id="app-root"><AppShell /></div>
      ) : (
        <div id="app-root">
          {page === "landing" && <Landing onSignIn={() => setPage("signin")} onSignUp={() => setPage("signup")} />}
          {page === "signin" && <SignIn onBackHome={() => setPage("landing")} onGoRegister={() => setPage("signup")} />}
          {page === "signup" && <SignUp onBackHome={() => setPage("landing")} onGoLogin={() => setPage("signin")} />}
        </div>
      )}
      <ToastContainer />
    </>
  );
}
