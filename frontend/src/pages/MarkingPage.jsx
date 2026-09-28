import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { iconFor } from "../icons";
import { FLAG_LABEL, STATUS_LABEL, DECISION_LABEL } from "../helpers";

function highlightEvidence(ocrText, scores) {
  let html = ocrText;
  const spans = scores.map((s) => s.evidence_span).filter((s) => s && s.trim().length > 3)
    .sort((a, b) => b.length - a.length);
  for (const span of spans) {
    const idx = html.toLowerCase().indexOf(span.toLowerCase());
    if (idx === -1) continue;
    html = html.slice(0, idx) + "<mark>" + html.slice(idx, idx + span.length) + "</mark>" + html.slice(idx + span.length);
  }
  return html;
}

export default function MarkingPage({ segmentId, onBack, onNextPaper }) {
  const { user, segments, model, discrepancyThreshold, call, toast, loadSegments, setActiveId } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [markInput, setMarkInput] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const isSupervisor = user.role === "Supervisor";
  const idx = segments.findIndex((s) => s.segment_id === segmentId);
  const seg = segments.find((s) => s.segment_id === segmentId);
  const decision = seg ? seg.teacher_decision : null;

  useEffect(() => {
    setActiveId(segmentId);
    setData(null);
    setError(null);
    (async () => {
      try {
        const res = await call(`/api/mark/${segmentId}?model=${model}`);
        if (!res.ok) { setError(await res.text()); return; }
        const d = await res.json();
        setData(d);
        setMarkInput(d.total_awarded);
      } catch (err) {
        setError(String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId, model]);

  const stepItems = segments.slice(0, 8);

  async function submitDecision(action, adjustedTotal, aiTotal) {
    setBusy(true);
    try {
      const res = await call(`/api/decision/${segmentId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adjusted_total: adjustedTotal, ai_total: aiTotal, comment }),
      });
      if (!res.ok) { toast("Failed to save decision: " + (await res.text()), "error"); return; }
      const { decision: rec } = await res.json();
      await loadSegments();
      if (rec.triggers_second_marking) {
        const gap = Math.abs(adjustedTotal - aiTotal).toFixed(1);
        toast(`Discrepancy of ${gap} marks - second marking triggered`, "warning");
      } else {
        toast("Decision saved: " + action.toUpperCase(), "success");
      }
    } catch (err) {
      toast("Failed to save decision: " + err, "error");
    } finally {
      setBusy(false);
    }
  }

  async function approveSupervisor() {
    setBusy(true);
    const res = await call(`/api/supervisor-approve/${segmentId}`, { method: "POST" });
    if (!res.ok) { toast("Failed to approve: " + (await res.text()), "error"); setBusy(false); return; }
    toast("Approved and finalized.", "success");
    await loadSegments();
    setBusy(false);
  }

  async function handleNext() {
    if (!seg || !seg.teacher_decision) {
      setBusy(true);
      await submitDecision("accept", data.total_awarded, data.total_awarded);
      setBusy(false);
    }
    const i = segments.findIndex((s) => s.segment_id === segmentId);
    const next = segments[i + 1];
    if (next) onNextPaper(next.segment_id);
    else { toast("No more papers in the queue.", "info"); onBack(); }
  }

  const decidedCount = segments.filter((s) => s.teacher_decision).length;
  const totalCount = segments.length;
  const batchPct = totalCount ? Math.round((decidedCount / totalCount) * 100) : 0;

  let statusDisplay = data ? (STATUS_LABEL[data.status] || data.status) : "";
  if (seg && seg.triggers_second_marking) statusDisplay = "Second Marking Triggered";
  else if (decision) statusDisplay = DECISION_LABEL[decision] || decision;

  return (
    <>
      <div className="breadcrumb">
        <span><a onClick={onBack}>Dashboard</a> / Marking Queue / Paper #{segmentId} {idx >= 0 ? `/ ${idx + 1} of ${segments.length}` : ""}</span>
        <button className="back-btn" onClick={onBack}>&larr; BACK TO QUEUE</button>
      </div>
      <div className="step-indicator">
        {stepItems.map((s) => (
          <div key={s.segment_id}
            className={`step-circle ${s.segment_id === segmentId ? "current" : s.teacher_decision ? "done" : ""}`}
            title={s.segment_id} onClick={() => onNextPaper(s.segment_id)}>
            {s.teacher_decision ? "✓" : ""}
          </div>
        ))}
      </div>

      {error && <div className="empty-state">Error: {error}</div>}
      {!error && !data && <div className="loading"><span className="spinner"></span>Running Rubric &rarr; Solution &rarr; Evaluation &rarr; Critic pipeline...</div>}

      {data && (
        <div className="review-grid review-grid-3">
          <section className="panel">
            <div className="panel-head head-teal"><h2>Exam Scan</h2></div>
            <div className="body-pad">
              <div className="meta-row">
                <span className="confidence-pill">Anon UUID: <b>{data.anon_uuid}</b></span>
                <span className="confidence-pill">OCR confidence: <b>{(data.ocr_confidence * 100).toFixed(0)}%</b></span>
              </div>
              {data.image_path && data.image_path.startsWith("data:image") ? (
                <img src={data.image_path} style={{ maxWidth: "100%", borderRadius: "var(--radius)", border: "1px solid var(--border)", marginBottom: 12, display: "block" }} alt="Scanned answer" />
              ) : (
                <div className="scanned-image-placeholder">[ Scanned Answer Sheet Image {data.image_path ? "- " + data.image_path : "(not supplied in this demo)"} ]</div>
              )}
              <div className="ocr-block" dir="auto" dangerouslySetInnerHTML={{ __html: highlightEvidence(data.ocr_text, data.scores) }} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head head-green"><h2>AI Workspace</h2></div>
            <div className="body-pad">
              <div className="question-block" dir="auto">
                {data.question_text || <span style={{ color: "var(--text-faint)" }}>No question text provided - the Rubric Agent derived criteria from the exam/subject only.</span>}
              </div>
              <div className="pipeline-trace">
                Rubric source: <b>{data.rubric_source}</b> &middot; Model: <b>{data.model_used}</b> &middot; Ran in {data.elapsed_seconds ?? "?"}s
              </div>
              <div className="total-box">
                <span className="num">{data.total_awarded}</span><span className="of">/ {data.max_marks}</span>
                {data.human_mark == null
                  ? <span className="human">No gold mark (live submission)</span>
                  : <span className="human">Human mark (gold): {data.human_mark}</span>}
              </div>
              <div className="status-line">AI suggested mark &middot; Overall confidence: {(data.overall_confidence * 100).toFixed(0)}%</div>
              <div className="flags">
                {data.flags.length
                  ? data.flags.map((f) => <span key={f} className="flag-chip">{FLAG_LABEL[f] || f}</span>)
                  : <span className="flag-chip ok">No flags</span>}
              </div>
              {data.scores.map((s) => (
                <div key={s.criterion_id} className="criterion">
                  <div className="crow">
                    <span className="cname">{iconFor(s)} {s.criterion_id}</span>
                    <span className="cmarks">{s.awarded} / {s.max_marks}</span>
                  </div>
                  <div className="cevidence" dir="auto">{s.evidence_span ? `"${s.evidence_span}"` : "(no evidence found)"}</div>
                  <div className="cjust" dir="auto">{s.justification}</div>
                  <div className="cconf">Confidence: {(s.confidence * 100).toFixed(0)}%</div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2>Examiner Inputs</h2></div>
            <div className="body-pad">
              <div className="status-line">Status: <b>{statusDisplay}</b></div>

              {isSupervisor ? (
                <>
                  {!decision ? (
                    <div id="decision-note" className="decision-note" style={{ marginTop: 12 }}>
                      No Teacher decision recorded yet for this paper. Supervisor approval becomes available once a Teacher has reviewed it.
                    </div>
                  ) : (
                    <>
                      <div className="decision-note" style={{ marginTop: 12 }}>
                        Teacher decision: <b>{decision.toUpperCase()}</b>.
                        {seg.supervisor_approved ? " Already approved and finalized by Supervisor." : " Awaiting Supervisor approval to finalize."}
                      </div>
                      <div className="decision-row">
                        {seg.supervisor_approved
                          ? <span className="confidence-pill">&#10003; Approved</span>
                          : <button className="accept" disabled={busy} onClick={approveSupervisor}>Approve &amp; Finalize</button>}
                      </div>
                    </>
                  )}
                  <button className="next-btn" style={{ marginTop: 0 }} onClick={onBack}>&larr; BACK TO AUDIT QUEUE</button>
                </>
              ) : (
                <>
                  <div className="form-field">
                    <label>Assign Final Mark</label>
                    <div className="mark-stepper">
                      <button className="step-btn" type="button" onClick={() => setMarkInput((v) => Math.max(0, v - 0.5))}>&minus;</button>
                      <input type="number" step="0.5" min="0" max={data.max_marks} value={markInput} onChange={(e) => setMarkInput(parseFloat(e.target.value) || 0)} />
                      <span className="of-max">/ {data.max_marks}</span>
                      <button className="step-btn" type="button" onClick={() => setMarkInput((v) => Math.min(data.max_marks, v + 0.5))}>+</button>
                    </div>
                  </div>
                  <div className="form-field">
                    <label>Feedback for Student (optional)</label>
                    <textarea placeholder="Add specific, constructive feedback…" value={comment} onChange={(e) => setComment(e.target.value)} />
                  </div>
                  <div className="decision-row">
                    <button className="accept" disabled={busy} onClick={() => submitDecision(markInput === data.total_awarded ? "accept" : "adjust", markInput, data.total_awarded)}>Approve Mark</button>
                    <button className="flag" disabled={busy} onClick={() => submitDecision("flag", null, data.total_awarded)}>Flag for Supervisor Review</button>
                  </div>
                  <div className="decision-note">
                    {decision ? <>Recorded decision: <b>{decision.toUpperCase()}</b>. </> : "No decision recorded yet. "}
                    Decisions are demo-only (this module hands off to Result Storage, owned separately).
                  </div>
                  <button className="next-btn" disabled={busy} onClick={handleNext}>SUBMIT &amp; NEXT PAPER &rarr;</button>
                </>
              )}

              <div className="batch-status">
                <div>Batch Status: <b>{decidedCount}/{totalCount} papers marked</b></div>
                <div className="progress-track"><div className="progress-fill t-green" style={{ width: `${batchPct}%` }}></div></div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
