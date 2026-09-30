using Backend.Models;
using Backend.Services;
using Microsoft.Extensions.Configuration;

namespace Backend.Tests;

public class PapersServiceTests
{
    // Points at a small, controlled 2-row fixture instead of the real
    // ai-service gold set - keeps these tests independent of that file's
    // exact contents.
    private static PapersService NewService()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["GoldSetPath"] = "fixtures/gold_set.jsonl" })
            .Build();
        return new PapersService(config);
    }

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
    public void Admin_sees_all_gold_set_rows()
    {
        var papers = NewService();
        var rows = papers.VisibleRows(AdminSession());
        Assert.Equal(2, rows.Count);
    }

    [Fact]
    public void Teacher_only_sees_gold_set_plus_papers_assigned_to_them()
    {
        var papers = NewService();
        var teacher = TeacherSession("someteacher@gmail.com");

        // Gold-set rows are visible to every Teacher (the fixed sample set).
        var rows = papers.VisibleRows(teacher);
        Assert.Equal(2, rows.Count);

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
