import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { API_BASE } from "../api";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const QUICK_CREDS = { Admin: { email: "admin@gmail.com", password: "admin123" } };

export default function SignIn({ onBackHome, onGoRegister }) {
  const { login, toast } = useApp();
  const [domains, setDomains] = useState({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Teacher");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(API_BASE + "/api/domains").then((r) => r.json()).then(setDomains).catch(() => {});
  }, []);

  function validateEmail(value, currentRole) {
    const v = value.trim();
    if (!v) { setEmailError(""); return true; }
    if (!EMAIL_RE.test(v)) { setEmailError("Enter a valid email address."); return false; }
    const domain = domains[currentRole];
    if (domain && !v.toLowerCase().endsWith("@" + domain)) {
      setEmailError(`${currentRole} accounts must use an @${domain} email address.`);
      return false;
    }
    setEmailError("");
    return true;
  }

  async function doLogin(e, mail, pass, r) {
    e.preventDefault();
    setLoginError("");
    if (!validateEmail(mail, r)) return;
    setBusy(true);
    try {
      const data = await login(mail, pass, r, remember);
      toast(`Welcome, ${data.name}`, "success");
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function quickLogin(r) {
    const creds = QUICK_CREDS[r];
    setEmail(creds.email); setPassword(creds.password); setRole(r);
    doLogin({ preventDefault() {} }, creds.email, creds.password, r);
  }

  return (
    <div className="auth-split">
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="login-brand">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
            </svg>
            <span className="gradient-text">Paper Marker</span>
          </div>
          <div className="auth-badge-pill">Secure Sign In</div>
          <h2>Login</h2>
          <p className="login-sub">Sign in to your Marking Queue, dashboard, or results.</p>

          <form onSubmit={(e) => doLogin(e, email, password, role)}>
            <div className="form-field">
              <label>Email</label>
              <div className="input-icon-field">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>
                <input type="text" placeholder="Enter your email" value={email}
                  onChange={(e) => { setEmail(e.target.value); validateEmail(e.target.value, role); }} />
              </div>
              {emailError && <div className="field-error">{emailError}</div>}
            </div>
            <div className="form-field">
              <label>Password</label>
              <div className="input-icon-field password-field">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="password-eye" onClick={() => setShowPassword((v) => !v)} aria-label="Show password">&#128065;</button>
              </div>
            </div>
            <div className="form-field">
              <label>Select Role</label>
              <select className="form-input" value={role} onChange={(e) => { setRole(e.target.value); validateEmail(email, e.target.value); }}>
                <option value="Teacher">Teacher</option>
                <option value="Admin">Admin</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Student">Student</option>
              </select>
            </div>

            <div className="auth-row">
              <label className="remember-me">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
              </label>
              <a href="#" onClick={(e) => { e.preventDefault(); toast("Not part of this demo - handled by the Faculty Management module.", "info"); }}>
                Forgot password?
              </a>
            </div>

            <button className="primary login-btn" type="submit" disabled={busy}>Sign In</button>
            <div className="login-error">{loginError}</div>
          </form>

          <div className="quick-roles quick-roles-admin-only">
            <button className="quick-role role-admin" onClick={() => quickLogin("Admin")}>Admin Demo Login</button>
          </div>
          <div className="login-hint">Admin only &mdash; Teachers and Students sign in with their own credentials above.</div>

          <p className="auth-switch">Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); onGoRegister(); }}>Sign up</a></p>
          <div className="login-links"><a href="#" onClick={(e) => { e.preventDefault(); onBackHome(); }}>&larr; Back to home</a></div>
          <div className="auth-footer">&copy; 2026 Paper Marker &middot; FYP, Air University Islamabad</div>
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-shot-card">
          <div className="browser-chrome">
            <span className="dot dot-red"></span><span className="dot dot-amber"></span><span className="dot dot-green"></span>
            <span className="browser-chrome-title">Marking Queue &mdash; live</span>
          </div>
          <img src="/hero-preview.png" alt="Paper Marker AI marking review screen" className="hero-shot" />
        </div>
        <div className="auth-stat-badge">
          <div className="auth-stat-label">EVIDENCE-VERIFIED</div>
          <div className="auth-stat-num">Every mark, quoted</div>
        </div>
        <div className="auth-tagline">
          <h2>Every mark, evidence-backed.</h2>
          <p>Anonymous, multi-agent, human-reviewed.</p>
          <div className="auth-feature-list">
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Bilingual: Urdu &amp; English</div>
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> 4-agent marking pipeline</div>
            <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg> Human-in-the-loop review</div>
          </div>
        </div>
      </div>
    </div>
  );
}
