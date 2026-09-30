using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Backend.Models;

namespace Backend.Services;

/// <summary>
/// Demo-only authentication - a faithful C# port of the original auth.py.
/// Faculty Management (real registration/approval/credential storage) is a
/// teammate's module; this simulates that flow closely enough to demo it:
/// self-registration with a role-appropriate email domain, an email
/// verification code, and (for Teacher accounts) an Admin approval gate.
/// Everything here is in-memory and resets when the server restarts.
/// </summary>
public class AuthService
{
    public static readonly Dictionary<string, string> RoleDomains = new()
    {
        ["Admin"] = "gmail.com",
        ["Supervisor"] = "gmail.com",
        ["Teacher"] = "gmail.com",
        ["Student"] = "gmail.com",
    };

    // Admin and Supervisor accounts are pre-seeded only - both are
    // provisioned, not self-registered. Only Teacher/Student self-register.
    private static readonly HashSet<string> SelfRegisterRoles = ["Teacher", "Student"];

    private static readonly Regex EmailRe = new(
        @"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$", RegexOptions.Compiled);

    // How long an idle session stays valid before requiring a fresh login -
    // real risk for a real deployment (a forgotten logged-in session on a
    // shared lab/exam-center computer), not just demo polish.
    private static readonly TimeSpan SessionLifetime = TimeSpan.FromHours(8);

    // Pre-seeded accounts: root Admin and Supervisor (can't self-register),
    // plus one already-approved demo Teacher/Student so quick-login and
    // manual sign-in both work without forcing a fresh registration.
    // Passwords are hashed even for these fixed demo accounts (PBKDF2, see
    // PasswordHasher) - nothing in this store is ever plain text.
    private readonly ConcurrentDictionary<string, UserRecord> _users = new(new[]
    {
        KeyValuePair.Create("admin@gmail.com", new UserRecord { Password = PasswordHasher.Hash("admin123"), Role = "Admin", Name = "System Admin", Status = "approved" }),
        KeyValuePair.Create("supervisor@gmail.com", new UserRecord { Password = PasswordHasher.Hash("supervisor123"), Role = "Supervisor", Name = "Demo Supervisor", Status = "approved" }),
        KeyValuePair.Create("teacher.demo@gmail.com", new UserRecord { Password = PasswordHasher.Hash("teacher123"), Role = "Teacher", Name = "Demo Teacher", Status = "approved" }),
        KeyValuePair.Create("student.demo@gmail.com", new UserRecord { Password = PasswordHasher.Hash("student123"), Role = "Student", Name = "Demo Student", Status = "approved" }),
    });

    private readonly ConcurrentDictionary<string, PendingVerification> _pendingVerification = new();
    private readonly ConcurrentDictionary<string, SessionEntry> _sessions = new();

    public string DomainHint(string role) => RoleDomains.GetValueOrDefault(role, "");

    public bool IsValidEmailFormat(string email) => EmailRe.IsMatch(email.Trim());

    private bool ValidDomain(string email, string role)
    {
        var domain = DomainHint(role);
        return domain.Length > 0 && email.ToLowerInvariant().EndsWith("@" + domain);
    }

    /// <summary>Returns (code, error) - exactly one is non-null.</summary>
    public (string? Code, string? Error) Register(string name, string email, string password, string role)
    {
        email = email.Trim().ToLowerInvariant();
        if (!SelfRegisterRoles.Contains(role))
            return (null, "Only Teacher and Student accounts can self-register. Admin accounts are provisioned separately.");
        if (string.IsNullOrWhiteSpace(name))
            return (null, "Name is required.");
        if (!IsValidEmailFormat(email))
            return (null, "Enter a valid email address.");
        if (!ValidDomain(email, role))
            return (null, $"{role} accounts must use an @{RoleDomains[role]} email address.");
        if (_users.ContainsKey(email) || _pendingVerification.ContainsKey(email))
            return (null, "An account with this email already exists.");
        if (password.Length < 6)
            return (null, "Password must be at least 6 characters.");

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        // Hash immediately - plain text never sits in memory beyond this
        // one call, not even in the pending-verification record.
        _pendingVerification[email] = new PendingVerification
        {
            Code = code, Name = name.Trim(), Password = PasswordHasher.Hash(password), Role = role,
        };
        return (code, null);
    }

    /// <summary>Returns (status, error) - exactly one is non-null.</summary>
    public (string? Status, string? Error) VerifyEmail(string email, string code)
    {
        email = email.Trim().ToLowerInvariant();
        if (!_pendingVerification.TryGetValue(email, out var pending) || pending.Code != code)
            return (null, "Invalid or expired verification code.");

        var status = pending.Role == "Teacher" ? "pending_approval" : "approved";
        _users[email] = new UserRecord
        {
            Password = pending.Password, Role = pending.Role, Name = pending.Name, Status = status,
        };
        _pendingVerification.TryRemove(email, out _);
        return (status, null);
    }

    public List<object> ListPendingApprovals() =>
        _users.Where(kv => kv.Value.Status == "pending_approval")
              .Select(kv => (object)new { email = kv.Key, name = kv.Value.Name, role = kv.Value.Role })
              .ToList();

    public bool ApproveUser(string email)
    {
        if (!_users.TryGetValue(email, out var user) || user.Status != "pending_approval") return false;
        user.Status = "approved";
        return true;
    }

    public bool RejectUser(string email)
    {
        if (!_users.TryGetValue(email, out var user) || user.Status != "pending_approval") return false;
        return _users.TryRemove(email, out _);
    }

    /// <summary>Returns ((token, session), error) - exactly one is non-null.</summary>
    public ((string Token, SessionRecord Session)? Result, string? Error) Authenticate(string email, string password, string role)
    {
        email = email.Trim().ToLowerInvariant();
        if (!IsValidEmailFormat(email))
            return (null, "Enter a valid email address.");
        if (RoleDomains.ContainsKey(role) && !ValidDomain(email, role))
            return (null, $"{role} accounts must use an @{RoleDomains[role]} email address.");

        if (!_users.TryGetValue(email, out var user) || user.Role != role || !PasswordHasher.Verify(password, user.Password))
            return (null, "Invalid email, password, or role.");
        if (user.Status == "pending_approval")
            return (null, "Your account is awaiting Admin approval.");
        if (user.Status != "approved")
            return (null, "Account is not active.");

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
        var session = new SessionRecord { Email = email, Role = user.Role, Name = user.Name };
        _sessions[token] = new SessionEntry { Session = session, ExpiresAt = DateTime.UtcNow.Add(SessionLifetime) };
        return ((token, session), null);
    }

    /// <summary>Null if the token doesn't exist OR has expired - an expired
    /// session is deleted on first access rather than left around.</summary>
    public SessionRecord? GetSession(string token)
    {
        if (!_sessions.TryGetValue(token, out var entry)) return null;
        if (entry.ExpiresAt < DateTime.UtcNow)
        {
            _sessions.TryRemove(token, out _);
            return null;
        }
        return entry.Session;
    }

    /// <summary>Approved Teacher accounts, for Admin's assignment dropdown.</summary>
    public List<TeacherInfo> ListTeachers() =>
        _users.Where(kv => kv.Value.Role == "Teacher" && kv.Value.Status == "approved")
              .Select(kv => new TeacherInfo(kv.Key, kv.Value.Name))
              .ToList();
}
