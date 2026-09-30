using Backend.Services;

namespace Backend.Tests;

public class AuthServiceTests
{
    // Fresh AuthService per test - constructor re-seeds the 4 demo accounts
    // each time, so tests can't leak state into each other.
    private static AuthService NewAuth() => new();

    [Fact]
    public void Seeded_admin_account_can_log_in_with_its_known_password()
    {
        var auth = NewAuth();
        var (result, error) = auth.Authenticate("admin@gmail.com", "admin123", "Admin");
        Assert.Null(error);
        Assert.NotNull(result);
        Assert.Equal("Admin", result!.Value.Session.Role);
    }

    [Fact]
    public void Login_fails_with_wrong_password()
    {
        var auth = NewAuth();
        var (result, error) = auth.Authenticate("admin@gmail.com", "wrong-password", "Admin");
        Assert.Null(result);
        Assert.Equal("Invalid email, password, or role.", error);
    }

    [Fact]
    public void Login_fails_when_role_does_not_match_the_account()
    {
        var auth = NewAuth();
        // Right email+password, wrong role - must not succeed just because
        // the credentials happen to match a *different* role's account.
        var (result, _) = auth.Authenticate("admin@gmail.com", "admin123", "Teacher");
        Assert.Null(result);
    }

    [Fact]
    public void Admin_cannot_self_register()
    {
        var auth = NewAuth();
        var (code, error) = auth.Register("Fake Admin", "fakeadmin@gmail.com", "password123", "Admin");
        Assert.Null(code);
        Assert.Contains("provisioned separately", error);
    }

    [Fact]
    public void Student_registration_requires_the_correct_domain()
    {
        var auth = NewAuth();
        var (code, error) = auth.Register("Some Student", "student@yahoo.com", "password123", "Student");
        Assert.Null(code);
        Assert.Contains("@gmail.com", error);
    }

    [Fact]
    public void Registration_rejects_a_short_password()
    {
        var auth = NewAuth();
        var (code, error) = auth.Register("Some Student", "newstudent@gmail.com", "abc", "Student");
        Assert.Null(code);
        Assert.Contains("6 characters", error);
    }

    [Fact]
    public void Student_can_log_in_immediately_after_verifying_no_approval_gate()
    {
        var auth = NewAuth();
        var (code, regError) = auth.Register("New Student", "newstudent@gmail.com", "password123", "Student");
        Assert.Null(regError);

        var (status, verifyError) = auth.VerifyEmail("newstudent@gmail.com", code!);
        Assert.Null(verifyError);
        Assert.Equal("approved", status);

        var (loginResult, loginError) = auth.Authenticate("newstudent@gmail.com", "password123", "Student");
        Assert.Null(loginError);
        Assert.NotNull(loginResult);
    }

    [Fact]
    public void Teacher_cannot_log_in_until_admin_approves_even_after_verifying_email()
    {
        var auth = NewAuth();
        var (code, _) = auth.Register("New Teacher", "newteacher@gmail.com", "password123", "Teacher");

        var (status, _) = auth.VerifyEmail("newteacher@gmail.com", code!);
        Assert.Equal("pending_approval", status);

        var (loginResult, loginError) = auth.Authenticate("newteacher@gmail.com", "password123", "Teacher");
        Assert.Null(loginResult);
        Assert.Contains("awaiting Admin approval", loginError);

        Assert.True(auth.ApproveUser("newteacher@gmail.com"));

        var (loginResult2, loginError2) = auth.Authenticate("newteacher@gmail.com", "password123", "Teacher");
        Assert.Null(loginError2);
        Assert.NotNull(loginResult2);
    }

    [Fact]
    public void Verifying_with_the_wrong_code_fails()
    {
        var auth = NewAuth();
        auth.Register("New Student", "newstudent2@gmail.com", "password123", "Student");
        var (status, error) = auth.VerifyEmail("newstudent2@gmail.com", "000000");
        Assert.Null(status);
        Assert.Equal("Invalid or expired verification code.", error);
    }

    [Fact]
    public void Cannot_register_the_same_email_twice()
    {
        var auth = NewAuth();
        auth.Register("First", "dupe@gmail.com", "password123", "Student");
        var (code, error) = auth.Register("Second", "dupe@gmail.com", "password123", "Student");
        Assert.Null(code);
        Assert.Contains("already exists", error);
    }

    [Fact]
    public void GetSession_returns_null_for_an_unknown_token()
    {
        var auth = NewAuth();
        Assert.Null(auth.GetSession("this-token-was-never-issued"));
    }

    [Fact]
    public void A_freshly_issued_session_token_is_valid()
    {
        var auth = NewAuth();
        var (result, _) = auth.Authenticate("admin@gmail.com", "admin123", "Admin");
        var session = auth.GetSession(result!.Value.Token);
        Assert.NotNull(session);
        Assert.Equal("admin@gmail.com", session!.Email);
    }
}
