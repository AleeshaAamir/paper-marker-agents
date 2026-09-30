using Backend.Services;

namespace Backend.Tests;

public class PasswordHasherTests
{
    [Fact]
    public void Verify_accepts_the_correct_password()
    {
        var hash = PasswordHasher.Hash("correct-horse-battery-staple");
        Assert.True(PasswordHasher.Verify("correct-horse-battery-staple", hash));
    }

    [Fact]
    public void Verify_rejects_a_wrong_password()
    {
        var hash = PasswordHasher.Hash("correct-horse-battery-staple");
        Assert.False(PasswordHasher.Verify("wrong-password", hash));
    }

    [Fact]
    public void Hash_never_stores_the_password_in_plain_text()
    {
        var hash = PasswordHasher.Hash("admin123");
        Assert.DoesNotContain("admin123", hash);
    }

    [Fact]
    public void Hash_is_salted_so_the_same_password_hashes_differently_each_time()
    {
        var hash1 = PasswordHasher.Hash("same-password");
        var hash2 = PasswordHasher.Hash("same-password");
        Assert.NotEqual(hash1, hash2);
        // ... but both still verify correctly against the same input.
        Assert.True(PasswordHasher.Verify("same-password", hash1));
        Assert.True(PasswordHasher.Verify("same-password", hash2));
    }
}
