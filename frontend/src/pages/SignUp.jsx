import { useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { API_BASE } from "../api";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export default function SignUp({ onBackHome, onGoLogin }) {
  const { toast } = useApp();
  const [domains, setDomains] = useState({});
  const [step, setStep] = useState("form"); // "form" | "verify"
  const [role, setRole] = useState("Student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [busy, setBusy] = useState(false);

  const [pendingEmail, setPendingEmail] = useState("");
  const [verifyTargetText, setVerifyTargetText] = useState("");
  const [demoMailNote, setDemoMailNote] = useState(null);
  const [code, setCode] = useState("");

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
  function validatePassword(value) {
    if (value && value.length < 6) { setPasswordError("Password must be at least 6 characters."); return false; }
    setPasswordError("");
    return true;
  }
  function validateConfirm(value, pass) {
    if (value && value !== pass) { setConfirmError("Passwords do not match."); return false; }
    setConfirmError("");
    return true;
  }

  async function submitRegister(e) {
    e.preventDefault();
    setRegisterError("");
    if (!name.trim() || !email.trim() || !password || !confirm) {
      setRegisterError("All fields are required."); return;
    }
    const ok = validateEmail(email, role) && validatePassword(password) && validateConfirm(confirm, password);
    if (!ok) { setRegisterError("Fix the highlighted fields above."); return; }

    setBusy(true);
    try {
      const res = await fetch(API_BASE + "/api/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });
      const data = await res.json();
      if (!res.ok) { setRegisterError(data.detail || "Registration failed."); return; }

      if (data.email_sent) {
        setVerifyTargetText(`A verification code was emailed to ${data.email} - check your inbox.`);
        setDemoMailNote(<><b>Real email sent.</b> Check the inbox (and spam folder) for <b>{data.email}</b>.</>);
      } else {
        setVerifyTargetText(`We've "sent" a code to ${data.email}`);
        setDemoMailNote(<>
          <b>Demo mode:</b> real email delivery isn't configured for this address, so here's the code it would have sent:
          <span className="code">{data.demo_verification_code}</span>
          In the live system this arrives by email instead.
        </>);
      }
      setPendingEmail(data.email);
      setStep("verify");
    } catch (err) {
      setRegisterError("Could not reach the server: " + err);
    } finally {
      setBusy(false);
    }
  }

  async function submitVerify(e) {
    e.preventDefault();
    setVerifyError("");
    try {
      const res = await fetch(API_BASE + "/api/verify-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setVerifyError(data.detail || "Verification failed."); return; }

      if (data.status === "pending_approval") {
        toast("Email verified. Your Teacher account now awaits Admin approval before you can log in.", "success");
      } else {
        toast("Email verified - you can log in now.", "success");
      }
      onGoLogin();
    } catch (err) {
      setVerifyError("Could not reach the server: " + err);
    }
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

          {step === "form" ? (
            <div>
              <div className="auth-badge-pill">Create Account</div>
              <h2>Sign Up</h2>
              <p className="login-sub">Create your account to start using Paper Marker.</p>

              <div className="info-callout">
                <span className="info-callout-icon">&#127891;</span>
                <div>
                  <b>Use a real Gmail address.</b> Both Teachers and Students sign up with an <b>@gmail.com</b> address - a
                  verification code is emailed there during sign-up. Admin and Supervisor accounts are provisioned
                  separately and can't self-register.
                </div>
              </div>

              <form onSubmit={submitRegister}>
                <div className="form-field">
                  <label>Role</label>
                  <select className="form-input" value={role} onChange={(e) => { setRole(e.target.value); validateEmail(email, e.target.value); }}>
                    <option value="Student">Student</option>
                    <option value="Teacher">Teacher</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Full Name</label>
                  <input type="text" placeholder="e.g. Ali Ahmed" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Email <span className="hint">{domains[role] ? `must end in @${domains[role]}` : ""}</span></label>
                  <div className="input-icon-field">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" /></svg>
                    <input type="text" placeholder={`e.g. yourname@${domains[role] || "gmail.com"}`} value={email}
                      onChange={(e) => { setEmail(e.target.value); validateEmail(e.target.value, role); }} />
                  </div>
                  {emailError && <div className="field-error">{emailError}</div>}
                </div>
                <div className="form-field">
                  <label>Password</label>
                  <div className="input-icon-field password-field">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <input type={showPassword ? "text" : "password"} placeholder="Create a password" value={password}
                      onChange={(e) => { setPassword(e.target.value); validatePassword(e.target.value); validateConfirm(confirm, e.target.value); }} />
                    <button type="button" className="password-eye" onClick={() => setShowPassword((v) => !v)} aria-label="Show password">&#128065;</button>
                  </div>
                  {passwordError ? <div className="field-error">{passwordError}</div> : <div className="field-hint">Must be at least 6 characters.</div>}
                </div>
                <div className="form-field">
                  <label>Confirm Password</label>
                  <div className="input-icon-field password-field">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    <input type={showConfirm ? "text" : "password"} placeholder="Re-enter password" value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); validateConfirm(e.target.value, password); }} />
                    <button type="button" className="password-eye" onClick={() => setShowConfirm((v) => !v)} aria-label="Show password">&#128065;</button>
                  </div>
                  {confirmError && <div className="field-error">{confirmError}</div>}
                </div>

                <button className="primary login-btn" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create my account"}</button>
                <div className="login-error">{registerError}</div>
              </form>
              <p className="auth-switch">Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); onGoLogin(); }}>Sign in</a></p>
              <div className="login-links"><a href="#" onClick={(e) => { e.preventDefault(); onBackHome(); }}>&larr; Back to home</a></div>
            </div>
          ) : (
            <div>
              <h2>Verify Your Email</h2>
              <p className="login-sub">{verifyTargetText}</p>
              <div className="demo-mail-note">{demoMailNote}</div>

              <form onSubmit={submitVerify}>
                <div className="form-field">
                  <label>Verification Code</label>
                  <input type="text" placeholder="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <button className="primary login-btn" type="submit">Verify Email</button>
                <div className="login-error">{verifyError}</div>
              </form>
              <div className="login-links"><a href="#" onClick={(e) => { e.preventDefault(); onGoLogin(); }}>Back to sign in</a></div>
              <div className="login-links"><a href="#" onClick={(e) => { e.preventDefault(); onBackHome(); }}>&larr; Back to home</a></div>
            </div>
          )}
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-quote">
          <p>&ldquo;Every criterion is checked against the exact words a student
          wrote &mdash; not a guess, and not a black box. If the evidence isn't
          there, the mark isn't either.&rdquo;</p>
          <div className="auth-quote-attr">How the Evaluation and Critic agents work together</div>
        </div>
        <div className="auth-shot-card auth-shot-card-sm">
          <div className="browser-chrome">
            <span className="dot dot-red"></span><span className="dot dot-amber"></span><span className="dot dot-green"></span>
            <span className="browser-chrome-title">Marking Queue &mdash; live</span>
          </div>
          <img src="/hero-preview.png" alt="Paper Marker AI marking review screen" className="hero-shot" />
        </div>
      </div>
    </div>
  );
}
