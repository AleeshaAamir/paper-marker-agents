"""
Demo-only authentication.

Faculty Management (scope doc 6.1) - registration, admin approval, real
credential storage - is a teammate's module, not implemented here. This
file simulates that module's flow closely enough to demo it:
self-registration with a role-appropriate email domain, an
email-verification code (see mailer.py for real delivery when
configured), and (for Teacher accounts, per 6.1: "Admin reviews and
approves registrations") an Admin approval gate before the account can
log in.

Everything here is in-memory and resets when the server restarts.
"""

import random
import re
import secrets
from typing import Optional, Tuple

# All three roles must use one of these domains - checked on both
# registration AND login, so picking the wrong role for an email gives a
# specific, useful error instead of a generic "invalid credentials".
ROLE_DOMAINS = {
    "Admin": "gmail.com",
    "Teacher": "gmail.com",
    "Student": "students.au.edu.pk",
}

# Admin accounts are pre-seeded only - self-registration is Teacher/Student.
SELF_REGISTER_ROLES = {"Teacher", "Student"}

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

# Pre-seeded accounts: one root Admin (can't self-register - someone has to
# be able to approve the first Teacher), plus one already-approved demo
# Teacher/Student so the quick-login buttons keep working without forcing
# a fresh registration every demo run.
_users = {
    "admin.demo@gmail.com": {"password": "admin123", "role": "Admin", "name": "System Admin", "status": "approved"},
    "teacher.demo@gmail.com": {"password": "teacher123", "role": "Teacher", "name": "Demo Teacher", "status": "approved"},
    "student.demo@students.au.edu.pk": {"password": "student123", "role": "Student", "name": "Demo Student", "status": "approved"},
}
_pending_verification: dict = {}   # email -> {code, name, password, role}
_sessions: dict = {}               # token -> {email, role, name}


def domain_hint(role: str) -> str:
    return ROLE_DOMAINS.get(role, "")


def is_valid_email_format(email: str) -> bool:
    return bool(_EMAIL_RE.match(email.strip()))


def _valid_domain(email: str, role: str) -> bool:
    domain = domain_hint(role)
    return bool(domain) and email.lower().endswith("@" + domain)


def register(name: str, email: str, password: str, role: str) -> Tuple[Optional[str], Optional[str]]:
    """Returns (verification_code, None) on success, or (None, error)."""
    email = email.strip().lower()
    if role not in SELF_REGISTER_ROLES:
        return None, "Only Teacher and Student accounts can self-register. Admin accounts are provisioned separately."
    if not name.strip():
        return None, "Name is required."
    if not is_valid_email_format(email):
        return None, "Enter a valid email address."
    if not _valid_domain(email, role):
        return None, f"{role} accounts must use an @{ROLE_DOMAINS[role]} email address."
    if email in _users or email in _pending_verification:
        return None, "An account with this email already exists."
    if len(password) < 6:
        return None, "Password must be at least 6 characters."

    code = f"{random.randint(0, 999999):06d}"
    _pending_verification[email] = {
        "code": code, "name": name.strip(), "password": password, "role": role,
    }
    return code, None


def verify_email(email: str, code: str) -> Tuple[Optional[str], Optional[str]]:
    """Returns (new_status, None) on success, or (None, error)."""
    email = email.strip().lower()
    pending = _pending_verification.get(email)
    if not pending or pending["code"] != code:
        return None, "Invalid or expired verification code."

    status = "pending_approval" if pending["role"] == "Teacher" else "approved"
    _users[email] = {
        "password": pending["password"], "role": pending["role"],
        "name": pending["name"], "status": status,
    }
    del _pending_verification[email]
    return status, None


def list_pending_approvals() -> list:
    return [
        {"email": email, "name": u["name"], "role": u["role"]}
        for email, u in _users.items() if u["status"] == "pending_approval"
    ]


def approve_user(email: str) -> bool:
    user = _users.get(email)
    if user is None or user["status"] != "pending_approval":
        return False
    user["status"] = "approved"
    return True


def reject_user(email: str) -> bool:
    user = _users.get(email)
    if user is None or user["status"] != "pending_approval":
        return False
    del _users[email]
    return True


def authenticate(email: str, password: str, role: str) -> Tuple[Optional[Tuple[str, dict]], Optional[str]]:
    email = email.strip().lower()
    if not is_valid_email_format(email):
        return None, "Enter a valid email address."
    if role in ROLE_DOMAINS and not _valid_domain(email, role):
        return None, f"{role} accounts must use an @{ROLE_DOMAINS[role]} email address."

    user = _users.get(email)
    if not user or user["password"] != password or user["role"] != role:
        return None, "Invalid email, password, or role."
    if user["status"] == "pending_approval":
        return None, "Your account is awaiting Admin approval."
    if user["status"] != "approved":
        return None, "Account is not active."

    token = secrets.token_hex(16)
    session = {"email": email, "role": user["role"], "name": user["name"]}
    _sessions[token] = session
    return (token, session), None


def get_session(token: str) -> Optional[dict]:
    return _sessions.get(token)
