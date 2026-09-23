"""
Optional real email delivery for registration verification codes, via
Gmail SMTP (smtplib is Python stdlib - no extra package install, unlike
the Supabase client, so there's nothing here that can get stuck
downloading).

Reads SMTP_EMAIL and SMTP_APP_PASSWORD from the environment. Falls back
to "not sent" (caller shows the code on-screen instead) when:
  - those aren't set, or
  - the recipient's domain can't actually receive mail from us anyway -
    @students.au.edu.pk is a fictional institutional domain with no real
    mail server behind it in this demo; no amount of SMTP configuration
    on our end can deliver there. Only @gmail.com recipients (Teacher,
    Admin) can realistically receive a real email here.
"""

import os
import smtplib
from email.mime.text import MIMEText

SMTP_EMAIL = os.environ.get("SMTP_EMAIL")
SMTP_APP_PASSWORD = os.environ.get("SMTP_APP_PASSWORD")

# Domains we can actually deliver real mail to.
REAL_MAIL_DOMAINS = {"gmail.com"}


def is_configured() -> bool:
    return bool(SMTP_EMAIL and SMTP_APP_PASSWORD)


def can_deliver_to(email: str) -> bool:
    if not is_configured():
        return False
    domain = email.rsplit("@", 1)[-1].lower() if "@" in email else ""
    return domain in REAL_MAIL_DOMAINS


def send_verification_email(to_email: str, name: str, code: str) -> bool:
    """Returns True if actually sent. False means the caller should fall
    back to showing the code on-screen instead."""
    if not can_deliver_to(to_email):
        return False

    msg = MIMEText(
        f"Hi {name},\n\n"
        f"Your Paper Marker verification code is: {code}\n\n"
        "Enter this code on the registration page to finish creating your account. "
        "This code was requested as part of an FYP demo project.\n\n"
        "- Paper Marker"
    )
    msg["Subject"] = "Your Paper Marker verification code"
    msg["From"] = SMTP_EMAIL
    msg["To"] = to_email

    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
            server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
        return True
    except Exception as exc:
        print(f"[mailer] Failed to send verification email to {to_email}: {exc}")
        return False
