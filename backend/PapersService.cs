using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Backend.Models;

namespace Backend.Services;

/// <summary>
/// Papers, teacher decisions, supervisor approvals, and the activity log -
/// a C# port of the business logic that used to live in ai-service's
/// app.py. Same design as the Python version: everything in-memory, no
/// real database (that's a separate teammate's module, per the scope doc).
/// </summary>
public class PapersService
{
    private readonly List<PaperRow> _livePapers = [];
    private readonly ConcurrentDictionary<string, DecisionRecord> _teacherDecisions = new();
    private readonly List<ActivityEntry> _activityLog = [];
    private readonly object _activityLock = new();

    private List<PaperRow> Rows()
    {
        var rows = new List<PaperRow>(_livePapers);
        rows.Reverse(); // newest upload first
        return rows;
    }

    /// <summary>Same source list, narrowed to what this session's role may
    /// see. Admin and Supervisor see every uploaded paper (oversight
    /// roles); a Teacher only sees papers that have been assigned to
    /// them.</summary>
    public List<PaperRow> VisibleRows(SessionRecord session)
    {
        var rows = Rows();
        if (session.Role == "Teacher")
        {
            rows = rows.Where(r => r.AssignedTo == session.Email).ToList();
        }
        return rows;
    }

    public PaperRow? FindVisible(SessionRecord session, string segmentId) =>
        VisibleRows(session).FirstOrDefault(r => r.SegmentId == segmentId);

    public PaperRow AddLivePaper(NewPaperRequest paper)
    {
        var row = new PaperRow
        {
            SegmentId = $"LIVE-{Guid.NewGuid():N}"[..13].ToUpperInvariant(),
            AnonUuid = $"U-{Guid.NewGuid():N}"[..10].ToUpperInvariant(),
            ExamId = paper.Subject,
            QuestionId = string.IsNullOrWhiteSpace(paper.Subject)
                ? "Q-LIVE" : paper.Subject.Replace(" ", "-")[..Math.Min(20, paper.Subject.Length)],
            Language = paper.Language,
            MaxMarks = paper.MaxMarks,
            QuestionText = paper.QuestionText,
            MarkingScheme = paper.MarkingScheme,
            OfficialAnswerKey = paper.OfficialAnswerKey,
            OcrText = paper.OcrText,
            OcrConfidence = paper.OcrConfidence,
            ImagePath = paper.ImageDataUrl ?? "",
            HumanMark = null,
            Source = "live",
            AssignedTo = null,
        };
        _livePapers.Add(row);
        return row;
    }

    public PaperRow? AssignPaper(string segmentId, string? teacherEmail)
    {
        var row = _livePapers.FirstOrDefault(r => r.SegmentId == segmentId);
        if (row == null) return null;
        row.AssignedTo = teacherEmail;
        return row;
    }

    public DecisionRecord? GetDecision(string segmentId) => _teacherDecisions.GetValueOrDefault(segmentId);

    public DecisionRecord RecordDecision(string segmentId, DecisionRequest decision, double discrepancyThreshold)
    {
        var triggersSecondMarking =
            decision.Action == "adjust"
            && decision.AdjustedTotal is not null
            && decision.AiTotal is not null
            && Math.Abs(decision.AdjustedTotal.Value - decision.AiTotal.Value) > discrepancyThreshold;

        var record = new DecisionRecord
        {
            Action = decision.Action,
            AdjustedTotal = decision.AdjustedTotal,
            AiTotal = decision.AiTotal,
            Comment = decision.Comment,
            TriggersSecondMarking = triggersSecondMarking,
            SupervisorApproved = false,
        };
        _teacherDecisions[segmentId] = record;
        return record;
    }

    public bool SupervisorApprove(string segmentId, string approverEmail, out DecisionRecord? decision)
    {
        decision = GetDecision(segmentId);
        if (decision == null) return false;
        decision.SupervisorApproved = true;
        decision.SupervisorApprovedBy = approverEmail;
        return true;
    }

    /// <summary>A genuine record of things that actually happened in this
    /// session - not invented server telemetry. In-memory, capped.</summary>
    public void LogActivity(string actor, string action, string detail = "")
    {
        lock (_activityLock)
        {
            _activityLog.Insert(0, new ActivityEntry
            {
                At = DateTime.Now.ToString("HH:mm:ss"),
                Actor = actor, Action = action, Detail = detail,
            });
            if (_activityLog.Count > 200) _activityLog.RemoveRange(200, _activityLog.Count - 200);
        }
    }

    public List<ActivityEntry> RecentActivity(int count = 30)
    {
        lock (_activityLock) { return _activityLog.Take(count).ToList(); }
    }

    /// <summary>Deterministic per-result verification hash. Presented in the
    /// UI as a "Result Integrity Proof" / certificate hash - but this is a
    /// SHA-256 hash of the segment_id, computed and checked locally. There
    /// is no real distributed ledger behind it. Same algorithm as the
    /// original Python _verification_reference() for byte-identical output.</summary>
    public static string VerificationReference(string segmentId)
    {
        var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(segmentId));
        var digest = Convert.ToHexString(hashBytes)[..16]; // already uppercase hex
        return $"VR-{digest}";
    }
}
