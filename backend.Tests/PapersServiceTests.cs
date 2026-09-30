using Backend.Models;
using Backend.Services;

namespace Backend.Tests;

public class PapersServiceTests
{
    private static PapersService NewService() => new();

    private static SessionRecord AdminSession() => new() { Email = "admin@gmail.com", Role = "Admin", Name = "Admin" };
    private static SessionRecord TeacherSession(string email) => new() { Email = email, Role = "Teacher", Name = "Teacher" };

    [Fact]
    public void VerificationReference_is_deterministic_for_the_same_id()
    {
        var a = PapersService.VerificationReference("S001");
        var b = PapersService.VerificationReference("S001");
        Assert.Equal(a, b);
    }

    [Fact]
    public void VerificationReference_differs_for_different_ids()
    {
        var a = PapersService.VerificationReference("S001");
        var b = PapersService.VerificationReference("S002");
        Assert.NotEqual(a, b);
    }

    [Fact]
    public void VerificationReference_has_the_expected_VR_prefix_format()
    {
        var reference = PapersService.VerificationReference("S001");
        Assert.StartsWith("VR-", reference);
        Assert.Equal(19, reference.Length); // "VR-" + 16 hex chars
    }

    [Fact]
    public void Admin_sees_only_uploaded_papers_no_sample_data()
    {
        var papers = NewService();
        Assert.Empty(papers.VisibleRows(AdminSession()));

        var newPaper = new NewPaperRequest("Subject", "en", "Question", 5, "answer text");
        var row = papers.AddLivePaper(newPaper);
        Assert.Contains(papers.VisibleRows(AdminSession()), r => r.SegmentId == row.SegmentId);
    }

    [Fact]
    public void Teacher_only_sees_papers_assigned_to_them_no_sample_data()
    {
        var papers = NewService();
        var teacher = TeacherSession("someteacher@gmail.com");

        Assert.Empty(papers.VisibleRows(teacher));

        // A freshly-uploaded live paper is NOT visible until assigned to them.
        var newPaper = new NewPaperRequest("Subject", "en", "Question", 5, "answer text");
        var row = papers.AddLivePaper(newPaper);
        Assert.DoesNotContain(papers.VisibleRows(teacher), r => r.SegmentId == row.SegmentId);

        papers.AssignPaper(row.SegmentId, "someteacher@gmail.com");
        Assert.Contains(papers.VisibleRows(teacher), r => r.SegmentId == row.SegmentId);
    }

    [Fact]
    public void Small_adjustment_does_not_trigger_second_marking()
    {
        var papers = NewService();
        var decision = new DecisionRequest("adjust", 4.5, 4.0, null); // 0.5 mark gap
        var record = papers.RecordDecision("T001", decision, discrepancyThreshold: 1.0);
        Assert.False(record.TriggersSecondMarking);
    }

    [Fact]
    public void Large_adjustment_triggers_second_marking()
    {
        var papers = NewService();
        var decision = new DecisionRequest("adjust", 5.0, 1.0, null); // 4-mark gap, threshold 1.0
        var record = papers.RecordDecision("T002", decision, discrepancyThreshold: 1.0);
        Assert.True(record.TriggersSecondMarking);
    }

    [Fact]
    public void Accept_decisions_never_trigger_second_marking_regardless_of_gap()
    {
        var papers = NewService();
        // "accept" means the teacher agreed with the AI - there's no
        // adjustment gap to speak of, so this must never flag.
        var decision = new DecisionRequest("accept", 4.0, 4.0, null);
        var record = papers.RecordDecision("T001", decision, discrepancyThreshold: 1.0);
        Assert.False(record.TriggersSecondMarking);
    }

    [Fact]
    public void Supervisor_approval_fails_when_no_teacher_decision_exists_yet()
    {
        var papers = NewService();
        var ok = papers.SupervisorApprove("T001", "supervisor@gmail.com", out var decision);
        Assert.False(ok);
        Assert.Null(decision);
    }

    [Fact]
    public void Supervisor_approval_succeeds_once_a_teacher_decision_exists()
    {
        var papers = NewService();
        papers.RecordDecision("T001", new DecisionRequest("accept", 4.0, 4.0, null), 1.0);

        var ok = papers.SupervisorApprove("T001", "supervisor@gmail.com", out var decision);
        Assert.True(ok);
        Assert.NotNull(decision);
        Assert.True(decision!.SupervisorApproved);
        Assert.Equal("supervisor@gmail.com", decision.SupervisorApprovedBy);
    }

    [Fact]
    public void Activity_log_is_newest_first_and_capped()
    {
        var papers = NewService();
        papers.LogActivity("a@gmail.com", "first action");
        papers.LogActivity("b@gmail.com", "second action");

        var recent = papers.RecentActivity(30);
        Assert.Equal(2, recent.Count);
        Assert.Equal("second action", recent[0].Action); // newest first
        Assert.Equal("first action", recent[1].Action);
    }
}
