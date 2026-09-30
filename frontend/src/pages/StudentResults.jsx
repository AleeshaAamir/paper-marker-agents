import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "../AppContext";
import { iconFor } from "../icons";
import { gradingBand } from "../helpers";

export default function StudentResults() {
  const { call, toast } = useApp();
  const navigate = useNavigate();
  const { segmentId } = useParams();
  const [cards, setCards] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!segmentId) { setDetail(null); return; }
    setDetail(null);
    (async () => {
      const res = await call(`/api/mark/${segmentId}?model=stub`);
      if (!res.ok) { setLoadError(await res.text()); return; }
      setDetail(await res.json());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentId]);

  async function loadList() {
    try {
      const res = await call("/api/segments");
      const segs = await res.json();
      const reviewed = segs.filter((s) => s.teacher_decision);
      const results = await Promise.all(reviewed.map(async (seg) => {
        const r = await call(`/api/mark/${seg.segment_id}?model=stub`);
        const d = await r.json();
        const final = d.teacher_decision && d.teacher_decision.action === "adjust" ? d.teacher_decision.adjusted_total : d.total_awarded;
        return { seg, final, max: d.max_marks };
      }));
      setCards(results);
    } catch (err) {
      setLoadError(String(err));
    }
  }

  async function verifyIntegrity(segId) {
    const res = await call(`/api/verify/${segId}`);
    if (!res.ok) { toast("Could not verify: " + (await res.text()), "error"); return; }
    const v = await res.json();
    toast(v.integrity_verified ? "Integrity verified - hash matches." : "Verification failed.", v.integrity_verified ? "success" : "error");
  }

  if (loadError) return <div className="empty-state">Could not load results: {loadError}</div>;

  if (segmentId) {
    if (!detail) return <div className="loading"><span className="spinner"></span>Loading result...</div>;
    const final = detail.teacher_decision && detail.teacher_decision.action === "adjust" ? detail.teacher_decision.adjusted_total : detail.total_awarded;
    const pct = detail.max_marks ? Math.round((final / detail.max_marks) * 100) : 0;
    return (
      <>
        <div className="breadcrumb">
          <span><a onClick={() => navigate("/results")}>My Results</a> / <span dir="auto">{detail.question_text || segmentId}</span></span>
          <button className="back-btn no-print" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
        <div className="result-layout">
          <div>
            <div className="result-summary-card">
              <h3 dir="auto">{detail.question_text || segmentId}</h3>
              <div className="rs-top">
                <div><span className="result-summary-num">{final}</span><span className="result-summary-of"> / {detail.max_marks}</span></div>
              </div>
              <div className="result-summary-pct">{pct}% &middot; {gradingBand(pct)}</div>
            </div>
            <h3 style={{ margin: "0 0 10px" }}>Per-Question Analysis</h3>
            {detail.scores.map((s) => (
              <div key={s.criterion_id} className="pq-card">
                <div className="pq-head">
                  <div className="pq-head-left">{iconFor(s)} {s.criterion_id}</div>
                  <div className="pq-marks">{s.awarded} / {s.max_marks}</div>
                </div>
                <div className="pq-body">
                  <div className="cevidence" dir="auto">{s.evidence_span ? `"${s.evidence_span}"` : "(no evidence found)"}</div>
                  <div className="cjust" dir="auto">{s.justification}</div>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="integrity-card">
              <h3>&#128274; Result Integrity Proof</h3>
              <p>This result's certificate hash is computed from its record and can be re-verified at any time.</p>
              <div className="integrity-hash">{detail.certificate_hash}</div>
              <button className="action-btn no-print" style={{ width: "100%" }} onClick={() => verifyIntegrity(segmentId)}>Verify Integrity</button>
            </div>
            <div className="rubric-legend">
              <h3>Grading Bands</h3>
              <div className="rubric-band"><span>Distinction</span><b>90&ndash;100%</b></div>
              <div className="rubric-band"><span>Credit</span><b>75&ndash;89%</b></div>
              <div className="rubric-band"><span>Pass</span><b>50&ndash;74%</b></div>
              <div className="rubric-band"><span style={{ color: "var(--red)" }}>Unsatisfactory</span><b style={{ color: "var(--red)" }}>Below 50%</b></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (cards === null) return <div className="loading"><span className="spinner"></span>Loading your results...</div>;

  if (cards.length === 0) {
    return (
      <>
        <div className="results-toolbar"><div><h2>My Exam Results</h2><p>Results appear here once a teacher has reviewed them.</p></div></div>
        <div className="empty-state">No verified results yet.</div>
      </>
    );
  }

  return (
    <>
      <div className="results-toolbar">
        <div><h2>My Results</h2><p>Click a result to see its full breakdown and integrity proof.</p></div>
      </div>
      <div className="results-grid">
        {cards.map(({ seg, final, max }) => (
          <div key={seg.segment_id} className="score-card" style={{ cursor: "pointer" }} onClick={() => navigate(`/results/${seg.segment_id}`)}>
            <div className="score-card-label" dir="auto">{seg.question_text || seg.question_id}</div>
            <div className="score-card-num">{final}<span className="score-card-of"> / {max}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}
