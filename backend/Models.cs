namespace Backend.Models;

// --- request bodies (mirrors the Pydantic models that used to live in
// ai-service's app.py before the web-app logic moved here) ---------------

public record LoginRequest(string Email, string Password, string Role);

public record RegisterRequest(string Name, string Email, string Password, string Role);

public record VerifyEmailRequest(string Email, string Code);

public record NewPaperRequest(
    string Subject, string Language, string QuestionText, double MaxMarks,
    string OcrText, double OcrConfidence = 0.95,
    string? MarkingScheme = null, string? OfficialAnswerKey = null, string? ImageDataUrl = null);

public record AssignRequest(string? TeacherEmail);

public record DecisionRequest(string Action, double? AdjustedTotal, double? AiTotal, string? Comment);

// --- mutable in-memory records (same "no real database" design as the
// Python version - everything resets on restart) --------------------------

public class UserRecord
{
    public required string Password { get; set; }
    public required string Role { get; set; }
    public required string Name { get; set; }
    public required string Status { get; set; } // "approved" | "pending_approval"
}

public class SessionRecord
{
    public required string Email { get; set; }
    public required string Role { get; set; }
    public required string Name { get; set; }
}

/// <summary>Internal storage wrapper - keeps ExpiresAt out of the public
/// SessionRecord shape returned by /api/me and /api/login.</summary>
public class SessionEntry
{
    public required SessionRecord Session { get; set; }
    public required DateTime ExpiresAt { get; set; }
}

public class PendingVerification
{
    public required string Code { get; set; }
    public required string Name { get; set; }
    public required string Password { get; set; }
    public required string Role { get; set; }
}

public class DecisionRecord
{
    public required string Action { get; set; }
    public double? AdjustedTotal { get; set; }
    public double? AiTotal { get; set; }
    public string? Comment { get; set; }
    public bool TriggersSecondMarking { get; set; }
    public bool SupervisorApproved { get; set; }
    public string? SupervisorApprovedBy { get; set; }
}

public class PaperRow
{
    public required string SegmentId { get; set; }
    public required string AnonUuid { get; set; }
    public required string ExamId { get; set; }
    public required string QuestionId { get; set; }
    public required string Language { get; set; }
    public required double MaxMarks { get; set; }
    public string QuestionText { get; set; } = "";
    public string? MarkingScheme { get; set; }
    public string? OfficialAnswerKey { get; set; }
    public required string OcrText { get; set; }
    public required double OcrConfidence { get; set; }
    public string ImagePath { get; set; } = "";
    public double? HumanMark { get; set; }
    public string Source { get; set; } = "gold_set"; // "gold_set" | "live"
    public string? AssignedTo { get; set; }
}

public record TeacherInfo(string Email, string Name);

public class ActivityEntry
{
    public required string At { get; set; }
    public required string Actor { get; set; }
    public required string Action { get; set; }
    public string Detail { get; set; } = "";
}
