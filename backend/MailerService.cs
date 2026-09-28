using System.Net;
using System.Net.Mail;

namespace Backend.Services;

/// <summary>
/// Optional real email delivery for registration verification codes, via
/// Gmail SMTP (System.Net.Mail is stdlib - no extra package, mirrors the
/// original mailer.py's use of Python's smtplib).
///
/// Reads SMTP_EMAIL and SMTP_APP_PASSWORD from the environment. Falls back
/// to "not sent" (caller shows the code on-screen instead) when those
/// aren't set, or the recipient's domain isn't in RealMailDomains - every
/// role here registers with a real @gmail.com address specifically so this
/// path can actually deliver.
/// </summary>
public class MailerService
{
    private readonly string? _smtpEmail = Environment.GetEnvironmentVariable("SMTP_EMAIL");
    private readonly string? _smtpAppPassword = Environment.GetEnvironmentVariable("SMTP_APP_PASSWORD");
    private static readonly HashSet<string> RealMailDomains = ["gmail.com"];

    public bool IsConfigured => !string.IsNullOrEmpty(_smtpEmail) && !string.IsNullOrEmpty(_smtpAppPassword);

    public bool CanDeliverTo(string email)
    {
        if (!IsConfigured) return false;
        var at = email.LastIndexOf('@');
        var domain = at >= 0 ? email[(at + 1)..].ToLowerInvariant() : "";
        return RealMailDomains.Contains(domain);
    }

    /// <summary>Returns true if actually sent. False means the caller should
    /// fall back to showing the code on-screen instead.</summary>
    public bool SendVerificationEmail(string toEmail, string name, string code)
    {
        if (!CanDeliverTo(toEmail)) return false;

        try
        {
            using var client = new SmtpClient("smtp.gmail.com", 587)
            {
                EnableSsl = true,
                Credentials = new NetworkCredential(_smtpEmail, _smtpAppPassword),
                Timeout = 10_000,
            };
            using var message = new MailMessage(_smtpEmail!, toEmail)
            {
                Subject = "Your Paper Marker verification code",
                Body = $"Hi {name},\n\n" +
                      $"Your Paper Marker verification code is: {code}\n\n" +
                      "Enter this code on the registration page to finish creating your account. " +
                      "This code was requested as part of an FYP demo project.\n\n" +
                      "- Paper Marker",
            };
            client.Send(message);
            return true;
        }
        catch (Exception exc)
        {
            Console.WriteLine($"[mailer] Failed to send verification email to {toEmail}: {exc.Message}");
            return false;
        }
    }
}
