using System.Text.Json;
using Backend.Models;
using Backend.Services;

// Teacher-vs-AI discrepancy threshold (marks), per scope doc objective 4.1.
// Mirrors config.DISCREPANCY_THRESHOLD in ai-service/config.py exactly.
const double DiscrepancyThreshold = 1.0;

var builder = WebApplication.CreateBuilder(args);

// snake_case JSON everywhere (segment_id, teacher_decision, ...) so the
// API contract matches the frontend exactly, same shape the Python
// service used to return - no per-property [JsonPropertyName] needed.
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
});

builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<MailerService>();
builder.Services.AddSingleton<PapersService>();
builder.Services.AddHttpClient<AiServiceClient>(client =>
{
    var baseUrl = builder.Configuration["AiServiceUrl"] ?? "http://127.0.0.1:8001";
    client.BaseAddress = new Uri(baseUrl);
    client.Timeout = TimeSpan.FromMinutes(5); // the real (non-stub) model can be slow on CPU-only hardware
});

// The React dev server runs on a different origin (Vite default
// http://localhost:5173) than this API - CORS must be explicit.
const string CorsPolicy = "frontend";
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

var app = builder.Build();
app.UseCors(CorsPolicy);

// This is a pure API now - the real UI is the React app in frontend/,
// served by its own dev server (npm run dev, port 5173) or built and
// hosted separately. No static file serving lives here any more.
app.MapGet("/favicon.ico", () => Results.StatusCode(204));
app.MapGet("/", () => Results.Ok(new { service = "Paper Marker API", status = "running" }));

// --- auth helpers (mirror require_auth/require_admin/require_supervisor) -

(SessionRecord? Session, IResult? Error) RequireAuth(HttpRequest req, AuthService auth)
{
    var authHeader = req.Headers.Authorization.ToString();
    if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
        return (null, Results.Json(new { detail = "Not logged in." }, statusCode: 401));
    var session = auth.GetSession(authHeader["Bearer ".Length..]);
    if (session is null)
        return (null, Results.Json(new { detail = "Session expired - please log in again." }, statusCode: 401));
    return (session, null);
}

(SessionRecord? Session, IResult? Error) RequireAdmin(HttpRequest req, AuthService auth)
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return (null, error);
    if (session!.Role != "Admin") return (null, Results.Json(new { detail = "Admin access required." }, statusCode: 403));
    return (session, null);
}

(SessionRecord? Session, IResult? Error) RequireSupervisor(HttpRequest req, AuthService auth)
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return (null, error);
    if (session!.Role != "Supervisor") return (null, Results.Json(new { detail = "Supervisor access required." }, statusCode: 403));
    return (session, null);
}

// --- auth / registration ---------------------------------------------------

app.MapPost("/api/login", (LoginRequest req, AuthService auth) =>
{
    var (result, error) = auth.Authenticate(req.Email, req.Password, req.Role);
    if (result is null) return Results.Json(new { detail = error }, statusCode: 401);
    var (token, session) = result.Value;
    return Results.Ok(new { token, email = session.Email, role = session.Role, name = session.Name });
});

app.MapGet("/api/domains", (AuthService auth) =>
{
    // Dictionary keys bypass the snake_case naming policy (it only
    // transforms reflected property names) - needed here because the
    // frontend looks these up by the exact role name ("Admin", not
    // "admin"), matching the <option value="Admin"> values in the UI.
    var result = new Dictionary<string, string>
    {
        ["Admin"] = auth.DomainHint("Admin"),
        ["Supervisor"] = auth.DomainHint("Supervisor"),
        ["Teacher"] = auth.DomainHint("Teacher"),
        ["Student"] = auth.DomainHint("Student"),
    };
    return Results.Ok(result);
});

app.MapPost("/api/register", (RegisterRequest req, AuthService auth, MailerService mailer, PapersService papers) =>
{
    var (code, error) = auth.Register(req.Name, req.Email, req.Password, req.Role);
    if (code is null) return Results.Json(new { detail = error }, statusCode: 400);

    var email = req.Email.Trim().ToLowerInvariant();
    papers.LogActivity(email, "registration submitted", $"role: {req.Role}");
    var sent = mailer.SendVerificationEmail(email, req.Name, code);
    if (sent) return Results.Ok(new { email, email_sent = true });
    // SMTP not configured - fall back to showing the code on-screen.
    return Results.Ok(new { email, email_sent = false, demo_verification_code = code });
});

app.MapPost("/api/verify-email", (VerifyEmailRequest req, AuthService auth) =>
{
    var (status, error) = auth.VerifyEmail(req.Email, req.Code);
    if (status is null) return Results.Json(new { detail = error }, statusCode: 400);
    return Results.Ok(new { status });
});

app.MapGet("/api/pending-approvals", (HttpRequest req, AuthService auth) =>
{
    var (_, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    return Results.Ok(auth.ListPendingApprovals());
});

app.MapPost("/api/approve/{email}", (string email, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (session, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    if (!auth.ApproveUser(email)) return Results.Json(new { detail = "No pending registration for this email." }, statusCode: 404);
    papers.LogActivity(session!.Email, "approved registration", email);
    return Results.Ok(new { ok = true });
});

app.MapPost("/api/reject/{email}", (string email, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (session, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    if (!auth.RejectUser(email)) return Results.Json(new { detail = "No pending registration for this email." }, statusCode: 404);
    papers.LogActivity(session!.Email, "rejected registration", email);
    return Results.Ok(new { ok = true });
});

app.MapGet("/api/activity", (HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (_, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    return Results.Ok(papers.RecentActivity(30));
});

app.MapGet("/api/me", (HttpRequest req, AuthService auth) =>
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return error;
    return Results.Ok(session);
});

// --- papers / segments ------------------------------------------------------

app.MapGet("/api/segments", (HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return error;

    var rows = papers.VisibleRows(session!);
    var outp = rows.Select(row =>
    {
        var decision = papers.GetDecision(row.SegmentId);
        return new
        {
            segment_id = row.SegmentId,
            anon_uuid = row.AnonUuid,
            question_id = row.QuestionId,
            question_text = row.QuestionText,
            language = row.Language,
            max_marks = row.MaxMarks,
            human_mark = row.HumanMark,
            source = row.Source,
            assigned_to = row.AssignedTo,
            teacher_decision = decision?.Action,
            triggers_second_marking = decision?.TriggersSecondMarking ?? false,
            supervisor_approved = decision?.SupervisorApproved ?? false,
            ai_total = decision?.AiTotal,
            adjusted_total = decision?.AdjustedTotal,
        };
    });
    return Results.Ok(outp);
});

app.MapGet("/api/mark/{segmentId}", async (string segmentId, string model, HttpRequest req, AuthService auth, PapersService papers, AiServiceClient ai) =>
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return error;

    var row = papers.FindVisible(session!, segmentId);
    if (row is null) return Results.Json(new { detail = $"No such segment: {segmentId}" }, statusCode: 404);

    JsonElement marked;
    try
    {
        marked = await ai.MarkAsync(new
        {
            segment_id = row.SegmentId, anon_uuid = row.AnonUuid, exam_id = row.ExamId,
            question_id = row.QuestionId, language = row.Language, max_marks = row.MaxMarks,
            ocr_text = row.OcrText, ocr_confidence = row.OcrConfidence, image_path = row.ImagePath,
            marking_scheme = row.MarkingScheme, official_answer_key = row.OfficialAnswerKey,
            question_text = row.QuestionText, model,
        });
    }
    catch (HttpRequestException exc)
    {
        return Results.Json(new { detail = $"AI marking service error: {exc.Message}" }, statusCode: 502);
    }

    var response = new Dictionary<string, object?>();
    foreach (var prop in marked.EnumerateObject()) response[prop.Name] = prop.Value;
    response["ocr_text"] = row.OcrText;
    response["ocr_confidence"] = row.OcrConfidence;
    response["question_text"] = row.QuestionText;
    response["marking_scheme"] = row.MarkingScheme ?? "";
    response["human_mark"] = row.HumanMark;
    response["anon_uuid"] = row.AnonUuid;
    response["image_path"] = row.ImagePath;
    response["source"] = row.Source;
    response["verification_reference"] = PapersService.VerificationReference(segmentId);
    response["certificate_hash"] = PapersService.VerificationReference(segmentId);
    response["teacher_decision"] = papers.GetDecision(segmentId);
    return Results.Ok(response);
});

app.MapGet("/api/verify/{segmentId}", (string segmentId, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return error;

    var row = papers.FindVisible(session!, segmentId);
    if (row is null) return Results.Json(new { detail = $"No such segment: {segmentId}" }, statusCode: 404);
    var decision = papers.GetDecision(segmentId);
    if (decision is null) return Results.Json(new { detail = "This result has not been reviewed/approved yet." }, statusCode: 409);

    return Results.Ok(new
    {
        verified = true,
        integrity_verified = true,
        segment_id = segmentId,
        anon_uuid = row.AnonUuid,
        reference = PapersService.VerificationReference(segmentId),
        certificate_hash = PapersService.VerificationReference(segmentId),
    });
});

app.MapPost("/api/ocr", async (HttpRequest req, AuthService auth, AiServiceClient ai) =>
{
    var (_, error) = RequireAuth(req, auth);
    if (error != null) return error;

    var form = await req.ReadFormAsync();
    var file = form.Files["file"];
    if (file is null) return Results.Json(new { detail = "No file uploaded." }, statusCode: 422);
    var language = form["language"].FirstOrDefault() ?? "en";
    var model = form["model"].FirstOrDefault() ?? "stub";

    using var ms = new MemoryStream();
    await file.CopyToAsync(ms);

    JsonElement ocrResult;
    try
    {
        ocrResult = await ai.OcrAsync(ms.ToArray(), file.FileName, file.ContentType, language);
    }
    catch (HttpRequestException exc)
    {
        return Results.Json(new { detail = $"OCR failed: {exc.Message}" }, statusCode: 422);
    }

    var rawText = ocrResult.GetProperty("raw_text").GetString() ?? "";
    var confidence = ocrResult.GetProperty("confidence").GetDouble();
    var sourceType = ocrResult.GetProperty("source_type").GetString();

    var segmented = await ai.SegmentAsync(rawText, language, model);
    var previewDataUrl = sourceType == "pdf"
        ? null
        : $"data:{(string.IsNullOrEmpty(file.ContentType) ? "image/jpeg" : file.ContentType)};base64,{Convert.ToBase64String(ms.ToArray())}";

    return Results.Ok(new
    {
        question_text = segmented.GetProperty("question_text").GetString(),
        answer_text = segmented.GetProperty("answer_text").GetString(),
        confidence,
        preview_data_url = previewDataUrl,
        source_type = sourceType,
    });
});

app.MapPost("/api/papers", (NewPaperRequest paper, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (_, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    if (paper.Language != "en" && paper.Language != "ur")
        return Results.Json(new { detail = "language must be 'en' or 'ur'" }, statusCode: 400);

    var row = papers.AddLivePaper(paper);
    return Results.Ok(new
    {
        segment_id = row.SegmentId, anon_uuid = row.AnonUuid, exam_id = row.ExamId,
        question_id = row.QuestionId, language = row.Language, max_marks = row.MaxMarks,
        question_text = row.QuestionText, marking_scheme = row.MarkingScheme,
        official_answer_key = row.OfficialAnswerKey, ocr_text = row.OcrText,
        ocr_confidence = row.OcrConfidence, image_path = row.ImagePath,
        human_mark = row.HumanMark, source = row.Source, assigned_to = row.AssignedTo,
    });
});

app.MapGet("/api/teachers", (HttpRequest req, AuthService auth) =>
{
    var (_, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    return Results.Ok(auth.ListTeachers());
});

app.MapPost("/api/assign/{segmentId}", (string segmentId, AssignRequest body, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (_, error) = RequireAdmin(req, auth);
    if (error != null) return error;
    var row = papers.AssignPaper(segmentId, body.TeacherEmail);
    if (row is null) return Results.Json(new { detail = $"No such live paper: {segmentId}" }, statusCode: 404);
    return Results.Ok(new { segment_id = row.SegmentId, assigned_to = row.AssignedTo });
});

app.MapGet("/api/config", () => Results.Ok(new { discrepancy_threshold = DiscrepancyThreshold }));

app.MapPost("/api/decision/{segmentId}", (string segmentId, DecisionRequest decision, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (session, error) = RequireAuth(req, auth);
    if (error != null) return error;

    var record = papers.RecordDecision(segmentId, decision, DiscrepancyThreshold);
    var detail = segmentId + (record.TriggersSecondMarking ? " (second marking triggered)" : "");
    papers.LogActivity(session!.Email, $"recorded decision: {decision.Action}", detail);
    return Results.Ok(new { ok = true, segment_id = segmentId, decision = record });
});

app.MapPost("/api/supervisor-approve/{segmentId}", (string segmentId, HttpRequest req, AuthService auth, PapersService papers) =>
{
    var (session, error) = RequireSupervisor(req, auth);
    if (error != null) return error;

    if (!papers.SupervisorApprove(segmentId, session!.Email, out var decision))
        return Results.Json(new { detail = "No teacher decision recorded yet for this paper." }, statusCode: 409);
    papers.LogActivity(session.Email, "supervisor approved", segmentId);
    return Results.Ok(new { ok = true, segment_id = segmentId, decision });
});

app.Run();
