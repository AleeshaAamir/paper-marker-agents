function loadToken() {
  return localStorage.getItem("pm_token") || sessionStorage.getItem("pm_token") || null;
}
function saveToken(token, remember) {
  (remember ? localStorage : sessionStorage).setItem("pm_token", token);
}
function clearToken() {
  localStorage.removeItem("pm_token");
  sessionStorage.removeItem("pm_token");
}

const state = {
  token: loadToken(),
  user: null,
  segments: [],
  activeId: null,
  pendingImageDataUrl: null,
};

const appRoot = document.getElementById("app-root");
const toastContainer = document.getElementById("toast-container");

const QUICK_CREDS = {
  Admin: { email: "admin.demo@gmail.com", password: "admin123" },
  Teacher: { email: "teacher.demo@gmail.com", password: "teacher123" },
  Student: { email: "student.demo@students.au.edu.pk", password: "student123" },
};

const FLAG_LABEL = {
  LOW_OCR_CONFIDENCE: "Low OCR confidence",
  LOW_MODEL_CONFIDENCE: "Low model confidence",
  INCONSISTENT_RUNS: "Runs disagreed",
  CRITIC_REJECTED: "Critic rejected",
  PROMPT_INJECTION_SUSPECTED: "Prompt injection suspected",
  EMPTY_ANSWER: "Empty answer",
  URDU_LOW_RESOURCE: "Urdu (low-resource flag)",
};

const STATUS_LABEL = {
  AI_SCORED: "Pending Teacher Review",
  NEEDS_MANUAL_REVIEW: "Flagged for Manual Review",
  UNREADABLE: "Unreadable - Flagged for Manual Review",
};

const DECISION_LABEL = {
  accept: "Reviewed - Accepted",
  adjust: "Reviewed - Mark Adjusted",
  flag: "Reviewed - Flagged for Second Marking",
};

let discrepancyThreshold = 1.0;

// --- helpers ---------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function toast(message, kind = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  }, 3800);
}

function authHeaders(extra = {}) {
  const h = { ...extra };
  if (state.token) h.Authorization = "Bearer " + state.token;
  return h;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: authHeaders(opts.headers || {}),
  });
  if (res.status === 401) {
    toast("Session expired - please log in again.", "error");
    logout();
    throw new Error("unauthenticated");
  }
  return res;
}

function statusClass(seg) {
  if (seg.triggers_second_marking) return "status-flag";
  if (seg.teacher_decision === "accept") return "status-accept";
  if (seg.teacher_decision === "adjust") return "status-adjust";
  if (seg.teacher_decision === "flag") return "status-flag";
  return "status-pending";
}

function statusLabelFor(seg) {
  if (seg.triggers_second_marking) return "SECOND MARKING";
  return seg.teacher_decision ? seg.teacher_decision.toUpperCase() : "PENDING";
}

function actionLabelFor(seg) {
  if (seg.triggers_second_marking) return "REVW";
  if (seg.teacher_decision) return "VIEW";
  return "MARK";
}

// --- boot / auth -------------------------------------------------------

async function boot() {
  fetch("/api/config").then((r) => r.json()).then((c) => {
    discrepancyThreshold = c.discrepancy_threshold;
  });

  if (!state.token) { renderLanding(); return; }
  try {
    const res = await fetch("/api/me", { headers: authHeaders() });
    if (!res.ok) throw new Error("bad session");
    state.user = await res.json();
    renderShell();
  } catch {
    clearToken();
    state.token = null;
    renderLanding();
  }
}

function renderLanding() {
  appRoot.innerHTML = "";
  appRoot.appendChild(document.getElementById("tpl-landing").content.cloneNode(true));

  ["nav-sign-in", "hero-sign-in"].forEach((id) =>
    document.getElementById(id).addEventListener("click", renderLogin));
  ["nav-sign-up", "hero-get-started"].forEach((id) =>
    document.getElementById(id).addEventListener("click", renderRegister));

  document.querySelectorAll(".site-nav-links a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" });
    });
  });
}

function renderLogin() {
  appRoot.innerHTML = "";
  appRoot.appendChild(document.getElementById("tpl-login").content.cloneNode(true));

  const loginEmailEl = document.getElementById("login-email");
  const loginRoleEl = document.getElementById("login-role");

  let loginDomains = { Admin: "gmail.com", Teacher: "gmail.com", Student: "students.au.edu.pk" };
  fetch("/api/domains").then((r) => r.json()).then((d) => { loginDomains = d; }).catch(() => {});

  function validateLoginEmail() {
    const email = loginEmailEl.value.trim();
    if (!email) { fieldError(loginEmailEl, ""); return true; }
    if (!EMAIL_FORMAT_RE.test(email)) {
      fieldError(loginEmailEl, "Enter a valid email address.");
      return false;
    }
    const domain = loginDomains[loginRoleEl.value];
    if (domain && !email.toLowerCase().endsWith("@" + domain)) {
      fieldError(loginEmailEl, `${loginRoleEl.value} accounts must use an @${domain} email address.`);
      return false;
    }
    fieldError(loginEmailEl, "");
    return true;
  }
  loginEmailEl.addEventListener("input", validateLoginEmail);
  loginRoleEl.addEventListener("change", validateLoginEmail);

  wirePasswordEye("login-password", "login-password-eye");

  const doLogin = async (email, password, role) => {
    const errEl = document.getElementById("login-error");
    errEl.textContent = "";
    if (!validateLoginEmail()) { return; }
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role }),
      });
      if (!res.ok) {
        errEl.textContent = (await res.json()).detail || "Login failed.";
        return;
      }
      const data = await res.json();
      state.token = data.token;
      state.user = { email: data.email, role: data.role, name: data.name };
      const remember = document.getElementById("login-remember")?.checked || false;
      saveToken(state.token, remember);
      toast(`Welcome, ${data.name}`, "success");
      renderShell();
    } catch (err) {
      errEl.textContent = "Could not reach the server: " + err;
    }
  };

  document.getElementById("btn-login").addEventListener("click", () => {
    doLogin(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value,
      document.getElementById("login-role").value,
    );
  });

  document.querySelectorAll(".quick-role").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      const creds = QUICK_CREDS[role];
      document.getElementById("login-email").value = creds.email;
      document.getElementById("login-password").value = creds.password;
      document.getElementById("login-role").value = role;
      doLogin(creds.email, creds.password, role);
    });
  });

  document.getElementById("link-forgot").addEventListener("click", (e) => {
    e.preventDefault();
    toast("Not part of this demo - handled by the Faculty Management module.", "info");
  });
  document.getElementById("link-register").addEventListener("click", (e) => {
    e.preventDefault();
    renderRegister();
  });
  document.getElementById("link-back-home-1").addEventListener("click", (e) => {
    e.preventDefault();
    renderLanding();
  });
}

const EMAIL_FORMAT_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function fieldError(inputEl, message) {
  // A password field is wrapped in .password-field (input + eye button) -
  // anchor the error to that wrapper, not between the input and the eye
  // icon, or it lands inside the wrapper and breaks the layout.
  const anchor = inputEl.closest(".password-field") || inputEl;
  let err = anchor.nextElementSibling;
  if (!err || !err.classList || !err.classList.contains("field-error")) {
    err = document.createElement("div");
    err.className = "field-error";
    anchor.insertAdjacentElement("afterend", err);
  }
  err.textContent = message || "";
  inputEl.style.borderColor = message ? "var(--red)" : "";
}

function wirePasswordEye(fieldId, eyeId) {
  const field = document.getElementById(fieldId);
  const eye = document.getElementById(eyeId);
  eye.addEventListener("click", () => {
    const showing = field.type === "text";
    field.type = showing ? "password" : "text";
    eye.textContent = showing ? "\u{1F441}️" : "\u{1F576}️";
    eye.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });
}

async function renderRegister() {
  appRoot.innerHTML = "";
  appRoot.appendChild(document.getElementById("tpl-register").content.cloneNode(true));

  let domains = { Admin: "gmail.com", Teacher: "gmail.com", Student: "students.au.edu.pk" };
  try {
    domains = await (await fetch("/api/domains")).json();
  } catch { /* fall back to the defaults above */ }

  const roleEl = document.getElementById("reg-role");
  const emailEl = document.getElementById("reg-email");
  const hintEl = document.getElementById("reg-domain-hint");
  const passEl = document.getElementById("reg-password");
  const confirmEl = document.getElementById("reg-password-confirm");

  wirePasswordEye("reg-password", "reg-password-eye");
  wirePasswordEye("reg-password-confirm", "reg-password-confirm-eye");

  function updateDomainHint() {
    const domain = domains[roleEl.value];
    hintEl.textContent = `must end in @${domain}`;
    emailEl.placeholder = `e.g. yourname@${domain}`;
    validateEmailLive();
  }

  function validateEmailLive() {
    const email = emailEl.value.trim();
    if (!email) { fieldError(emailEl, ""); return true; }
    if (!EMAIL_FORMAT_RE.test(email)) {
      fieldError(emailEl, "Enter a valid email address.");
      return false;
    }
    const domain = domains[roleEl.value];
    if (domain && !email.toLowerCase().endsWith("@" + domain)) {
      fieldError(emailEl, `${roleEl.value} accounts must use an @${domain} email address.`);
      return false;
    }
    fieldError(emailEl, "");
    return true;
  }

  function validatePasswordLive() {
    if (passEl.value && passEl.value.length < 6) {
      fieldError(passEl, "Password must be at least 6 characters.");
      return false;
    }
    fieldError(passEl, "");
    return true;
  }

  function validateConfirmLive() {
    if (confirmEl.value && confirmEl.value !== passEl.value) {
      fieldError(confirmEl, "Passwords do not match.");
      return false;
    }
    fieldError(confirmEl, "");
    return true;
  }

  roleEl.addEventListener("change", updateDomainHint);
  emailEl.addEventListener("input", validateEmailLive);
  passEl.addEventListener("input", () => { validatePasswordLive(); validateConfirmLive(); });
  confirmEl.addEventListener("input", validateConfirmLive);
  updateDomainHint();

  ["link-back-to-login-1", "link-back-to-login-2"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (e) => {
      e.preventDefault();
      renderLogin();
    });
  });
  ["link-back-home-2", "link-back-home-3"].forEach((id) => {
    document.getElementById(id).addEventListener("click", (e) => {
      e.preventDefault();
      renderLanding();
    });
  });

  document.getElementById("btn-register").addEventListener("click", async () => {
    const errEl = document.getElementById("register-error");
    errEl.textContent = "";
    const password = passEl.value;
    const confirmPassword = confirmEl.value;
    const payload = {
      name: document.getElementById("reg-name").value.trim(),
      email: emailEl.value.trim(),
      password,
      role: roleEl.value,
    };
    if (!payload.name || !payload.email || !payload.password || !confirmPassword) {
      errEl.textContent = "All fields are required.";
      return;
    }
    const emailOk = validateEmailLive();
    const passOk = validatePasswordLive();
    const confirmOk = validateConfirmLive();
    if (!emailOk || !passOk || !confirmOk) {
      errEl.textContent = "Fix the highlighted fields above.";
      return;
    }
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.detail || "Registration failed."; return; }

      document.getElementById("register-step-form").style.display = "none";
      document.getElementById("register-step-verify").style.display = "block";

      if (data.email_sent) {
        document.getElementById("verify-target-email").textContent = `A verification code was emailed to ${data.email} - check your inbox.`;
        document.getElementById("demo-mail-note").innerHTML =
          `<b>Real email sent.</b> Check the inbox (and spam folder) for <b>${data.email}</b>.`;
      } else {
        document.getElementById("verify-target-email").textContent = `We've "sent" a code to ${data.email}`;
        document.getElementById("demo-mail-note").innerHTML =
          `<b>Demo mode:</b> real email delivery isn't configured for this address, so here's the code it would have sent:` +
          `<span class="code">${data.demo_verification_code}</span>` +
          `In the live system this arrives by email instead.`;
      }
      state.pendingVerifyEmail = data.email;
      state.pendingVerifyRole = payload.role;
    } catch (err) {
      errEl.textContent = "Could not reach the server: " + err;
    }
  });

  document.getElementById("btn-verify").addEventListener("click", async () => {
    const errEl = document.getElementById("verify-error");
    errEl.textContent = "";
    const code = document.getElementById("verify-code").value.trim();
    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: state.pendingVerifyEmail, code }),
      });
      const data = await res.json();
      if (!res.ok) { errEl.textContent = data.detail || "Verification failed."; return; }

      if (data.status === "pending_approval") {
        toast("Email verified. Your Teacher account now awaits Admin approval before you can log in.", "success");
      } else {
        toast("Email verified - you can log in now.", "success");
      }
      renderLogin();
    } catch (err) {
      errEl.textContent = "Could not reach the server: " + err;
    }
  });
}

function logout() {
  state.token = null;
  state.user = null;
  state.segments = [];
  state.activeId = null;
  clearToken();
  renderLogin();
}

// --- shell (topbar + layout) -------------------------------------------

function renderShell() {
  appRoot.innerHTML = "";
  appRoot.appendChild(document.getElementById("tpl-shell").content.cloneNode(true));

  document.getElementById("user-name").textContent = state.user.name;
  document.getElementById("user-role-badge").textContent = state.user.role;
  document.getElementById("btn-logout").addEventListener("click", logout);

  const modelEl = document.getElementById("model");
  modelEl.addEventListener("change", () => {
    if (state.activeId) showMarking(state.activeId);
  });

  const layout = document.getElementById("app-layout");
  const nav = document.getElementById("top-nav");

  if (state.user.role === "Student") {
    layout.classList.add("no-sidebar");
    nav.innerHTML = `<a id="nav-results" class="active">My Results</a>`;
    document.getElementById("nav-results").addEventListener("click", showStudentResults);
    showStudentResults();
  } else {
    renderSidebar();
    loadSegments().then(showDashboard);
  }
}

// --- sidebar / queue (Teacher, Admin) -----------------------------------

function renderSidebar() {
  const sidebar = document.getElementById("app-sidebar");
  const isAdmin = state.user.role === "Admin";

  // Uploading is Admin's job only - a Teacher only ever sees papers Admin
  // has assigned to them, never an upload button of their own.
  const uploadBtn = isAdmin
    ? `<button class="btn-upload-new" id="btn-new-paper">
         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
         Upload New Paper
       </button>`
    : "";
  const adminBtn = isAdmin
    ? `<button class="btn-upload-new" id="btn-pending-approvals" style="background:var(--purple);margin-bottom:10px">
         Pending Registrations <span id="pending-count"></span>
       </button>`
    : "";
  sidebar.innerHTML = `
    ${adminBtn}
    ${uploadBtn}
    <div class="sidebar-label">${isAdmin ? "All Papers" : "My Assigned Papers"}</div>
    <div id="queue" class="queue-list"></div>`;
  if (isAdmin) {
    document.getElementById("btn-new-paper").addEventListener("click", showUploadForm);
    document.getElementById("btn-pending-approvals").addEventListener("click", showPendingApprovals);
    refreshPendingCount();
  }
}

async function refreshPendingCount() {
  const badge = document.getElementById("pending-count");
  if (!badge) return;
  try {
    const res = await api("/api/pending-approvals");
    const list = await res.json();
    badge.innerHTML = list.length ? `<span class="pending-badge">${list.length}</span>` : "";
  } catch { /* ignore - not critical */ }
}

async function showPendingApprovals() {
  state.activeId = null;
  renderQueue();
  document.getElementById("main-content").innerHTML = '<div class="loading"><span class="spinner"></span>Loading pending registrations...</div>';

  const res = await api("/api/pending-approvals");
  const list = await res.json();

  const rows = list.map((u) => `
    <tr>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge lang-en">${u.role}</span></td>
      <td>
        <button class="approve-btn" data-email="${u.email}" data-action="approve">Approve</button>
        <button class="reject-btn" data-email="${u.email}" data-action="reject">Reject</button>
      </td>
    </tr>`).join("");

  document.getElementById("main-content").innerHTML = `
    <div class="dash-greeting"><h2>Pending Registrations</h2><p>Teacher accounts require Admin approval before they can log in (scope doc 6.1).</p></div>
    <div class="pending-table-wrap">
      ${list.length === 0
        ? '<div class="empty-state">No pending registrations.</div>'
        : `<table class="papers-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>`}
    </div>`;

  document.querySelectorAll(".approve-btn, .reject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { email, action } = btn.dataset;
      const res2 = await api(`/api/${action}/${encodeURIComponent(email)}`, { method: "POST" });
      if (!res2.ok) { toast(`Failed to ${action}: ` + (await res2.text()), "error"); return; }
      toast(`${action === "approve" ? "Approved" : "Rejected"} ${email}`, "success");
      refreshPendingCount();
      showPendingApprovals();
    });
  });
}

async function loadSegments() {
  try {
    const res = await api("/api/segments");
    state.segments = await res.json();
    renderQueue();
  } catch (err) {
    if (String(err) !== "Error: unauthenticated") toast("Could not load the marking queue: " + err, "error");
  }
}

function renderQueue() {
  const queueEl = document.getElementById("queue");
  if (!queueEl) return;
  queueEl.innerHTML = "";
  if (state.segments.length === 0) {
    queueEl.innerHTML = '<div class="empty-state">No papers yet. Upload one to get started.</div>';
    return;
  }
  for (const seg of state.segments) {
    const item = document.createElement("div");
    item.className = "queue-item" + (seg.segment_id === state.activeId ? " active" : "");
    item.innerHTML = `
      <div class="qid"><span>${seg.segment_id}</span><span class="qmarks">${seg.max_marks} marks</span></div>
      <div class="qsubject" dir="auto">${escapeHtml(seg.question_text || seg.question_id)}</div>
      <div class="qmeta">
        <span class="badge lang-${seg.language}">${seg.language.toUpperCase()}</span>
        <span class="badge ${statusClass(seg)}">${statusLabelFor(seg)}</span>
        ${seg.source === "live" ? '<span class="badge source-live">LIVE</span>' : ""}
      </div>`;
    item.addEventListener("click", () => showMarking(seg.segment_id));
    queueEl.appendChild(item);
  }
}

// --- dashboard -----------------------------------------------------------

async function showDashboard() {
  state.activeId = null;
  renderQueue();

  const isAdmin = state.user.role === "Admin";
  const total = state.segments.length;
  const pending = state.segments.filter((s) => !s.teacher_decision).length;
  const submitted = state.segments.filter((s) => s.teacher_decision === "accept" || s.teacher_decision === "adjust").length;

  let teachers = [];
  if (isAdmin) {
    try { teachers = await (await api("/api/teachers")).json(); } catch { /* non-critical */ }
  }
  const teacherName = (email) => (teachers.find((t) => t.email === email) || {}).name;

  const rows = state.segments.map((seg) => {
    const assignCell = isAdmin
      ? (seg.source === "live"
          ? `<select class="assign-select" data-id="${seg.segment_id}">
               <option value="">Unassigned</option>
               ${teachers.map((t) => `<option value="${t.email}" ${seg.assigned_to === t.email ? "selected" : ""}>${escapeHtml(t.name)}</option>`).join("")}
             </select>`
          : `<span class="confidence-pill">Sample data</span>`)
      : "";
    return `
    <tr>
      <td><b>${seg.segment_id}</b></td>
      <td dir="auto">${escapeHtml(seg.question_text || seg.question_id)}</td>
      <td><span class="badge lang-${seg.language}">${seg.language.toUpperCase()}</span></td>
      <td><span class="badge ${statusClass(seg)}">${statusLabelFor(seg)}</span></td>
      ${isAdmin ? `<td>${assignCell}</td>` : ""}
      <td><button class="action-btn" data-id="${seg.segment_id}">${actionLabelFor(seg)}</button></td>
    </tr>`;
  }).join("");

  document.getElementById("main-content").innerHTML = `
    <div class="dash-greeting">
      <h2>Good morning, ${escapeHtml(state.user.name)}</h2>
      <p>${isAdmin
        ? `System overview &middot; ${pending} paper(s) awaiting teacher review.`
        : `You have ${pending} paper(s) pending review.`}</p>
    </div>
    <div class="stat-grid">
      <div class="stat-tile t-blue"><div class="num">${total}</div><div class="label">${isAdmin ? "Papers in System" : "Assigned Papers"}</div></div>
      <div class="stat-tile t-amber"><div class="num">${pending}</div><div class="label">Pending Review</div></div>
      <div class="stat-tile t-green"><div class="num">${submitted}</div><div class="label">Submitted</div></div>
    </div>
    <div class="queue-table-wrap">
      <div class="queue-table-head">${isAdmin ? "All Papers - System-wide Overview" : "My Assigned Papers"}</div>
      ${total === 0
        ? `<div class="empty-state">${isAdmin ? 'No papers yet. Use "Upload New Paper" to add one.' : "No papers assigned to you yet - check back once Admin assigns some."}</div>`
        : `<table class="papers-table"><thead><tr><th>Segment ID</th><th>Question</th><th>Lang</th><th>Status</th>${isAdmin ? "<th>Assigned To</th>" : ""}<th>Action</th></tr></thead><tbody>${rows}</tbody></table>`}
    </div>`;

  document.querySelectorAll(".action-btn").forEach((btn) =>
    btn.addEventListener("click", () => showMarking(btn.dataset.id)));

  document.querySelectorAll(".assign-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const segId = sel.dataset.id;
      const teacherEmail = sel.value || null;
      const res = await api(`/api/assign/${segId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacher_email: teacherEmail }),
      });
      if (!res.ok) { toast("Failed to assign: " + (await res.text()), "error"); return; }
      toast(teacherEmail ? `Assigned to ${teacherName(teacherEmail) || teacherEmail}` : "Unassigned", "success");
    });
  });
}

// --- marking / review view -----------------------------------------------

function highlightEvidence(ocrText, scores) {
  let html = escapeHtml(ocrText);
  const spans = scores.map((s) => s.evidence_span).filter((s) => s && s.trim().length > 3)
    .sort((a, b) => b.length - a.length);
  for (const span of spans) {
    const escaped = escapeHtml(span);
    const idx = html.toLowerCase().indexOf(escaped.toLowerCase());
    if (idx === -1) continue;
    html = html.slice(0, idx) + "<mark>" + html.slice(idx, idx + escaped.length) + "</mark>" + html.slice(idx + escaped.length);
  }
  return html;
}

function stepIndicatorHtml() {
  const items = state.segments.slice(0, 8);
  return items.map((seg) => {
    let cls = "";
    if (seg.segment_id === state.activeId) cls = "current";
    else if (seg.teacher_decision) cls = "done";
    return `<div class="step-circle ${cls}" data-id="${seg.segment_id}" title="${seg.segment_id}">${seg.teacher_decision ? "&#10003;" : ""}</div>`;
  }).join("");
}

async function showMarking(id) {
  state.activeId = id;
  renderQueue();

  const idx = state.segments.findIndex((s) => s.segment_id === id);
  document.getElementById("main-content").innerHTML = `
    <div class="breadcrumb">
      <span><a id="crumb-dashboard">Dashboard</a> / Marking Queue / Paper #${id} ${idx >= 0 ? `/ ${idx + 1} of ${state.segments.length}` : ""}</span>
      <button class="back-btn" id="btn-back-dash">&larr; BACK TO QUEUE</button>
    </div>
    <div class="step-indicator">${stepIndicatorHtml()}</div>
    <div class="review-grid">
      <section class="panel">
        <div class="panel-head head-teal"><h2>Student Answer &mdash; Scanned Image + OCR Text</h2></div>
        <div class="body-pad" id="review-left"><div class="loading"><span class="spinner"></span>Loading...</div></div>
      </section>
      <section class="panel">
        <div class="panel-head head-green"><h2>AI Agent Assessment + Teacher Decision</h2></div>
        <div class="body-pad" id="review-right"><div class="loading"><span class="spinner"></span>Running Rubric &rarr; Solution &rarr; Evaluation &rarr; Critic pipeline...</div></div>
      </section>
    </div>`;

  document.getElementById("crumb-dashboard").addEventListener("click", showDashboard);
  document.getElementById("btn-back-dash").addEventListener("click", showDashboard);
  document.querySelectorAll(".step-circle").forEach((c) =>
    c.addEventListener("click", () => showMarking(c.dataset.id)));

  const model = document.getElementById("model").value;
  try {
    const res = await api(`/api/mark/${id}?model=${model}`);
    if (!res.ok) {
      const msg = await res.text();
      document.getElementById("review-right").innerHTML = `<div class="empty-state">Error ${res.status}: ${escapeHtml(msg)}</div>`;
      toast("Marking failed: " + msg, "error");
      return;
    }
    const data = await res.json();
    renderReviewLeft(data);
    renderReviewRight(data, id);
  } catch (err) {
    if (String(err) !== "Error: unauthenticated") {
      document.getElementById("review-right").innerHTML = `<div class="empty-state">Request failed: ${escapeHtml(String(err))}</div>`;
      toast("Marking request failed: " + err, "error");
    }
  }
}

function renderReviewLeft(data) {
  const imageBlock = data.image_path && data.image_path.startsWith("data:image")
    ? `<img src="${data.image_path}" style="max-width:100%;border-radius:var(--radius);border:1px solid var(--border);margin-bottom:12px;display:block">`
    : `<div class="scanned-image-placeholder">[ Scanned Answer Sheet Image ${data.image_path ? "- " + escapeHtml(data.image_path) : "(not supplied in this demo)"} ]</div>`;

  document.getElementById("review-left").innerHTML = `
    <div class="meta-row">
      <span class="confidence-pill">Anon UUID: <b>${data.anon_uuid}</b></span>
      <span class="confidence-pill">OCR confidence: <b>${(data.ocr_confidence * 100).toFixed(0)}%</b></span>
    </div>
    ${imageBlock}
    <div class="ocr-block" dir="auto">${highlightEvidence(data.ocr_text, data.scores)}</div>`;
}

function renderReviewRight(data, id) {
  const flagsHtml = data.flags.length
    ? data.flags.map((f) => `<span class="flag-chip">${FLAG_LABEL[f] || f}</span>`).join("")
    : `<span class="flag-chip ok">No flags</span>`;

  const checkSvg = `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`;
  const crossSvg = `<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

  const criteriaHtml = data.scores.map((s) => `
    <div class="criterion">
      <div class="crow">
        <span class="cname">${s.awarded > 0 ? checkSvg : crossSvg} ${s.criterion_id}</span>
        <span class="cmarks">${s.awarded} / ${s.max_marks}</span>
      </div>
      <div class="cevidence" dir="auto">${s.evidence_span ? '"' + escapeHtml(s.evidence_span) + '"' : "(no evidence found)"}</div>
      <div class="cjust" dir="auto">${escapeHtml(s.justification)}</div>
      <div class="cconf">Confidence: ${(s.confidence * 100).toFixed(0)}%</div>
    </div>`).join("");

  const seg = state.segments.find((s) => s.segment_id === id);
  const decision = seg ? seg.teacher_decision : null;
  const humanLine = data.human_mark === null || data.human_mark === undefined
    ? '<span class="human">No gold mark (live submission)</span>'
    : `<span class="human">Human mark (gold): ${data.human_mark}</span>`;

  // The AI pipeline's own status (data.status) never changes once the AI has
  // marked the answer - it does not know a teacher decision happened. Once a
  // decision is recorded, show that instead, or this line would say "Pending
  // Teacher Review" forever, even right after clicking Accept.
  let statusDisplay = STATUS_LABEL[data.status] || data.status;
  if (seg && seg.triggers_second_marking) {
    statusDisplay = "Second Marking Triggered";
  } else if (decision) {
    statusDisplay = DECISION_LABEL[decision] || decision;
  }

  document.getElementById("review-right").innerHTML = `
    <div class="question-block" dir="auto">${escapeHtml(data.question_text) || '<span style="color:var(--text-faint)">No question text provided - the Rubric Agent derived criteria from the exam/subject only.</span>'}</div>
    <div class="pipeline-trace">
      Rubric source: <b>${data.rubric_source}</b> &middot; Model: <b>${data.model_used}</b> &middot; Ran in ${data.elapsed_seconds ?? "?"}s
    </div>
    <div class="total-box">
      <span class="num">${data.total_awarded}</span><span class="of">/ ${data.max_marks}</span>
      ${humanLine}
    </div>
    <div class="status-line">Status: <b>${statusDisplay}</b> &middot; Overall confidence: ${(data.overall_confidence * 100).toFixed(0)}%</div>
    <div class="flags">${flagsHtml}</div>
    ${criteriaHtml}

    <div class="decision-row" style="margin-top:12px">
      <button class="accept" id="btn-accept">Accept ${data.total_awarded}/${data.max_marks}</button>
      <button class="adjust" id="btn-adjust">Adjust Mark</button>
      <button class="flag" id="btn-flag">Flag Paper</button>
    </div>
    <div class="adjust-inline hidden" id="adjust-inline">
      <label>New total:</label>
      <input type="number" id="adjust-value" step="0.5" value="${data.total_awarded}">
      <button class="primary small" id="btn-adjust-save">Save</button>
      <button class="small" id="btn-adjust-cancel">Cancel</button>
    </div>
    <textarea id="comment" placeholder="Teacher comment (optional)" style="margin-bottom:12px"></textarea>
    <div id="decision-note" class="decision-note">
      ${decision ? "Recorded decision: <b>" + decision.toUpperCase() + "</b>. " : "No decision recorded yet. "}
      Decisions are demo-only (this module hands off to Result Storage, owned separately).
    </div>
    <button class="next-btn" id="btn-next">SUBMIT &amp; NEXT PAPER &rarr;</button>
  `;

  const aiTotal = data.total_awarded;

  document.getElementById("btn-accept").addEventListener("click", () => submitDecision(id, "accept", aiTotal, aiTotal));
  document.getElementById("btn-adjust").addEventListener("click", () => {
    document.getElementById("adjust-inline").classList.remove("hidden");
    const input = document.getElementById("adjust-value");
    input.focus();
    input.select();
  });
  document.getElementById("btn-adjust-cancel").addEventListener("click", () =>
    document.getElementById("adjust-inline").classList.add("hidden"));
  document.getElementById("btn-adjust-save").addEventListener("click", () => {
    const val = parseFloat(document.getElementById("adjust-value").value);
    if (Number.isNaN(val)) { toast("Enter a valid number for the adjusted mark.", "error"); return; }
    document.getElementById("adjust-inline").classList.add("hidden");
    submitDecision(id, "adjust", val, aiTotal);
  });
  document.getElementById("btn-flag").addEventListener("click", () => submitDecision(id, "flag", null, aiTotal));

  document.getElementById("btn-next").addEventListener("click", async () => {
    const btn = document.getElementById("btn-next");
    const current = state.segments.find((s) => s.segment_id === id);

    // The button says SUBMIT - if the teacher hasn't clicked Accept/Adjust/
    // Flag yet, submitting here means accepting the AI's mark as-is, not
    // silently skipping to the next paper with no decision recorded.
    if (!current || !current.teacher_decision) {
      btn.disabled = true;
      btn.textContent = "Submitting...";
      await submitDecision(id, "accept", aiTotal, aiTotal);
      btn.disabled = false;
      btn.textContent = "SUBMIT & NEXT PAPER →";
    }

    const i = state.segments.findIndex((s) => s.segment_id === id);
    const next = state.segments[i + 1];
    if (next) showMarking(next.segment_id);
    else { toast("No more papers in the queue.", "info"); showDashboard(); }
  });
}

async function submitDecision(id, action, adjustedTotal, aiTotal) {
  const commentEl = document.getElementById("comment");
  const comment = commentEl ? commentEl.value : "";
  const btns = document.querySelectorAll(".decision-row button");
  btns.forEach((b) => (b.disabled = true));

  try {
    const res = await api(`/api/decision/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adjusted_total: adjustedTotal, ai_total: aiTotal, comment }),
    });
    if (!res.ok) { toast("Failed to save decision: " + (await res.text()), "error"); return; }
    const { decision } = await res.json();
    await loadSegments();

    // Update the status line in place - it must not keep reading "Pending
    // Teacher Review" once a decision has actually been recorded.
    const statusB = document.querySelector(".status-line b");
    if (statusB) {
      statusB.textContent = decision.triggers_second_marking
        ? "Second Marking Triggered"
        : (DECISION_LABEL[action] || action);
    }

    const note = document.getElementById("decision-note");
    if (decision.triggers_second_marking) {
      const gap = Math.abs(adjustedTotal - aiTotal).toFixed(1);
      if (note) {
        note.innerHTML = `<b style="color:var(--red)">Discrepancy of ${gap} marks exceeds the ${discrepancyThreshold}-mark threshold &rarr; second independent marking triggered.</b> (scope doc 4.1 discrepancy detection)`;
      }
      toast(`Discrepancy of ${gap} marks - second marking triggered`, "warning");
    } else {
      if (note) note.innerHTML = `Recorded decision: <b>${action.toUpperCase()}</b>. Decisions are demo-only (this module hands off to Result Storage, owned separately).`;
      toast("Decision saved: " + action.toUpperCase(), "success");
    }
  } catch (err) {
    if (String(err) !== "Error: unauthenticated") toast("Failed to save decision: " + err, "error");
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
}

// --- upload view -----------------------------------------------------

function showUploadForm() {
  if (state.user.role !== "Admin") {
    toast("Only Admin can upload papers.", "error");
    showDashboard();
    return;
  }
  state.activeId = null;
  renderQueue();

  document.getElementById("main-content").innerHTML = `
    <div class="upload-card">
      <h2>Upload an Answer Sheet</h2>
      <p class="upload-sub">Upload a photo or PDF showing both the question and the student's answer on one page. The AI reads the page, separates the question from the answer, and generates the Anonymous UUID automatically - nothing to retype.</p>

      <div class="dropzone" id="dropzone">
        <input type="file" id="f-image" accept="image/*,application/pdf,.pdf" hidden>
        <div id="dropzone-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
          <div><b>Click to upload</b> or drag a photo or PDF here</div>
          <div class="hint">JPG, PNG or PDF &middot; runs Tesseract OCR automatically</div>
        </div>
        <img id="image-preview" style="display:none">
      </div>
      <div id="ocr-status" class="ocr-status"></div>

      <div class="form-grid">
        <div class="form-field"><label>Subject / Exam</label><input type="text" id="f-subject" placeholder="e.g. CS-402 Operating Systems"></div>
        <div class="form-field"><label>Language</label>
          <select class="form-input" id="f-language"><option value="en">English</option><option value="ur">Urdu</option></select>
        </div>
        <div class="form-field span-2"><label>Question <span class="hint">auto-extracted by AI from the uploaded page &mdash; editable</span></label><textarea id="f-question" dir="auto" placeholder="Auto-filled after upload (or type/paste directly)"></textarea></div>
        <div class="form-field"><label>Max Marks</label><input type="number" id="f-max-marks" value="5" min="1" step="0.5"></div>
        <div class="form-field"><label>OCR Confidence <span class="hint">(0-1)</span></label><input type="number" id="f-ocr-confidence" value="0.95" min="0" max="1" step="0.01"></div>
        <div class="form-field span-2"><label>Marking Scheme <span class="hint">(optional)</span></label><textarea id="f-scheme" dir="auto" placeholder="e.g. 2 marks for definition, 3 marks for example"></textarea></div>
        <div class="form-field span-2"><label>Official Answer Key <span class="hint">(optional)</span></label><textarea id="f-key" dir="auto" placeholder="Leave blank to let the Solution Agent generate one"></textarea></div>
        <div class="form-field span-2"><label>Student's Answer (OCR Text) <span class="hint">auto-filled from photo &mdash; editable</span></label><textarea id="f-answer" dir="auto" style="min-height:120px" placeholder="Upload a photo above, or type/paste the answer directly"></textarea></div>
      </div>

      <div class="upload-actions">
        <button id="btn-cancel-upload">Cancel</button>
        <button class="primary" id="btn-submit-paper">Submit &amp; Mark with AI</button>
      </div>
    </div>`;

  document.getElementById("btn-cancel-upload").addEventListener("click", showDashboard);

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("f-image");
  const dzEmpty = document.getElementById("dropzone-empty");
  const preview = document.getElementById("image-preview");

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files[0]) handleImageFile(e.target.files[0]);
  });

  async function handleImageFile(file) {
    const status = document.getElementById("ocr-status");
    status.textContent = "Running OCR...";
    status.style.color = "var(--text-faint)";

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    try {
      const form = new FormData();
      if (isPdf) {
        // PDFs go straight to the server, which pulls text directly out of
        // the PDF's text layer - no image decode needed on this side.
        form.append("file", file, file.name);
      } else {
        const { blob } = await resizeImage(file);
        form.append("file", blob, "answer.jpg");
      }
      const language = document.getElementById("f-language").value;
      form.append("language", language);
      form.append("model", document.getElementById("model").value);

      const res = await api("/api/ocr", { method: "POST", body: form });
      if (!res.ok) { status.textContent = "OCR failed: " + (await res.text()); status.style.color = "var(--red)"; return; }
      const { question_text, answer_text, confidence, preview_data_url, source_type } = await res.json();

      state.pendingImageDataUrl = preview_data_url;
      if (preview_data_url) {
        preview.src = preview_data_url;
        preview.style.display = "block";
        dzEmpty.style.display = "none";
      } else {
        // PDFs have no rendered page image - just confirm the filename was accepted.
        dzEmpty.innerHTML = `<div><b>${escapeHtml(file.name)}</b> uploaded</div><div class="hint">Text extracted from the PDF's text layer</div>`;
      }

      // The agent reads the page and separates question from answer itself -
      // both fields are auto-filled, nothing to retype.
      document.getElementById("f-question").value = question_text;
      document.getElementById("f-answer").value = answer_text;
      document.getElementById("f-ocr-confidence").value = confidence.toFixed(2);
      const pct = Math.round(confidence * 100);
      const words = answer_text.split(/\s+/).filter(Boolean).length;
      const sourceNote = source_type === "pdf"
        ? " - extracted directly from the PDF's text layer, not OCR'd"
        : " (Tesseract OCR - works best on printed text)";
      const qNote = question_text ? "Question and answer separated automatically." : "No separate question detected - only an answer was found.";
      status.textContent = `${qNote} ${words} answer word(s) at ${pct}% confidence${sourceNote}. Review both fields below before submitting.`;
      status.style.color = confidence < 0.6 ? "var(--amber)" : "var(--text-faint)";
    } catch (err) {
      if (String(err) !== "Error: unauthenticated") { status.textContent = "Could not process this file: " + err; status.style.color = "var(--red)"; }
    }
  }

  document.getElementById("btn-submit-paper").addEventListener("click", submitNewPaper);
}

function resizeImage(file, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve({ blob, dataUrl: canvas.toDataURL("image/jpeg", quality) }), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function submitNewPaper() {
  const btn = document.getElementById("btn-submit-paper");
  const answer = document.getElementById("f-answer").value.trim();
  const question = document.getElementById("f-question").value.trim();
  if (!answer) { toast("Upload a file (or type an answer) before submitting.", "error"); return; }

  const payload = {
    subject: document.getElementById("f-subject").value.trim() || "Untitled",
    language: document.getElementById("f-language").value,
    question_text: question,
    max_marks: parseFloat(document.getElementById("f-max-marks").value) || 5,
    ocr_confidence: parseFloat(document.getElementById("f-ocr-confidence").value),
    marking_scheme: document.getElementById("f-scheme").value.trim() || null,
    official_answer_key: document.getElementById("f-key").value.trim() || null,
    ocr_text: answer,
    image_data_url: state.pendingImageDataUrl,
  };

  btn.disabled = true;
  btn.textContent = "Submitting...";
  try {
    const res = await api("/api/papers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { toast("Failed to submit paper: " + (await res.text()), "error"); return; }
    const paper = await res.json();
    state.pendingImageDataUrl = null;
    toast(`Paper submitted - Anonymous UUID ${paper.anon_uuid} generated. Marking now...`, "success");
    await loadSegments();
    await showMarking(paper.segment_id);
  } catch (err) {
    if (String(err) !== "Error: unauthenticated") toast("Failed to submit paper: " + err, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit & Mark with AI";
  }
}

// --- student results view -----------------------------------------------

async function showStudentResults() {
  document.getElementById("main-content").innerHTML = '<div class="loading"><span class="spinner"></span>Loading your results...</div>';
  try {
    const segRes = await api("/api/segments");
    const segments = await segRes.json();
    const reviewed = segments.filter((s) => s.teacher_decision);

    if (reviewed.length === 0) {
      document.getElementById("main-content").innerHTML = `
        <div class="results-toolbar"><div><h2>My Exam Results</h2><p>Results appear here once a teacher has reviewed them.</p></div></div>
        <div class="empty-state">No verified results yet.</div>`;
      return;
    }

    // Students see only their numbers - no per-criterion breakdown,
    // justification text, or verification reference. Just the score.
    const cards = await Promise.all(reviewed.map(async (seg) => {
      const res = await api(`/api/mark/${seg.segment_id}?model=stub`);
      const data = await res.json();
      const final = data.teacher_decision && data.teacher_decision.action === "adjust"
        ? data.teacher_decision.adjusted_total : data.total_awarded;
      return `
        <div class="score-card">
          <div class="score-card-label" dir="auto">${escapeHtml(seg.question_text || seg.question_id)}</div>
          <div class="score-card-num">${final}<span class="score-card-of"> / ${data.max_marks}</span></div>
        </div>`;
    }));

    document.getElementById("main-content").innerHTML = `
      <div class="results-toolbar">
        <div><h2>My Results</h2></div>
      </div>
      <div class="results-grid">${cards.join("")}</div>`;
  } catch (err) {
    if (String(err) !== "Error: unauthenticated") {
      document.getElementById("main-content").innerHTML = `<div class="empty-state">Could not load results: ${escapeHtml(String(err))}</div>`;
    }
  }
}

boot();
