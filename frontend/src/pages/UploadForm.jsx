import { useRef, useState } from "react";
import { useApp } from "../AppContext";

function resizeImage(file, maxDim = 1400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve({ blob }), "image/jpeg", quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function UploadForm({ onCancel, onSubmitted }) {
  const { model, call, toast, loadSegments } = useApp();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewNote, setPreviewNote] = useState(null);
  const [ocrStatus, setOcrStatus] = useState({ text: "", color: "var(--text-faint)" });
  const [submitting, setSubmitting] = useState(false);

  const [subject, setSubject] = useState("");
  const [language, setLanguage] = useState("en");
  const [question, setQuestion] = useState("");
  const [maxMarks, setMaxMarks] = useState(5);
  const [ocrConfidence, setOcrConfidence] = useState(0.95);
  const [scheme, setScheme] = useState("");
  const [key, setKey] = useState("");
  const [answer, setAnswer] = useState("");
  const [pendingImageDataUrl, setPendingImageDataUrl] = useState(null);

  async function handleFile(file) {
    setOcrStatus({ text: "Running OCR...", color: "var(--text-faint)" });
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    try {
      const form = new FormData();
      if (isPdf) {
        form.append("file", file, file.name);
      } else {
        const { blob } = await resizeImage(file);
        form.append("file", blob, "answer.jpg");
      }
      form.append("language", language);
      form.append("model", model);

      const res = await call("/api/ocr", { method: "POST", body: form });
      if (!res.ok) { setOcrStatus({ text: "OCR failed: " + (await res.text()), color: "var(--red)" }); return; }
      const { question_text, answer_text, confidence, preview_data_url, source_type } = await res.json();

      setPendingImageDataUrl(preview_data_url);
      if (preview_data_url) {
        setPreviewUrl(preview_data_url);
        setPreviewNote(null);
      } else {
        setPreviewUrl(null);
        setPreviewNote(file.name);
      }

      setQuestion(question_text);
      setAnswer(answer_text);
      setOcrConfidence(Number(confidence.toFixed(2)));

      const pct = Math.round(confidence * 100);
      const words = answer_text.split(/\s+/).filter(Boolean).length;
      const sourceNote = source_type === "pdf" ? " - extracted directly from the PDF's text layer, not OCR'd" : " (Tesseract OCR - works best on printed text)";
      const qNote = question_text ? "Question and answer separated automatically." : "No separate question detected - only an answer was found.";
      setOcrStatus({
        text: `${qNote} ${words} answer word(s) at ${pct}% confidence${sourceNote}. Review both fields below before submitting.`,
        color: confidence < 0.6 ? "var(--amber)" : "var(--text-faint)",
      });
    } catch (err) {
      setOcrStatus({ text: "Could not process this file: " + err, color: "var(--red)" });
    }
  }

  async function submit() {
    const ans = answer.trim();
    if (!ans) { toast("Upload a file (or type an answer) before submitting.", "error"); return; }

    setSubmitting(true);
    try {
      const res = await call("/api/papers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim() || "Untitled", language, question_text: question.trim(),
          max_marks: parseFloat(maxMarks) || 5, ocr_confidence: parseFloat(ocrConfidence),
          marking_scheme: scheme.trim() || null, official_answer_key: key.trim() || null,
          ocr_text: ans, image_data_url: pendingImageDataUrl,
        }),
      });
      if (!res.ok) { toast("Failed to submit paper: " + (await res.text()), "error"); return; }
      const paper = await res.json();
      toast(`Paper submitted - Anonymous UUID ${paper.anon_uuid} generated. Marking now...`, "success");
      await loadSegments();
      onSubmitted(paper.segment_id);
    } catch (err) {
      toast("Failed to submit paper: " + err, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="upload-card">
      <h2>Upload an Answer Sheet</h2>
      <p className="upload-sub">Upload a photo or PDF showing both the question and the student's answer on one page. The AI reads the page, separates the question from the answer, and generates the Anonymous UUID automatically - nothing to retype.</p>

      <div
        className={`dropzone${dragOver ? " dragover" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
      >
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf,.pdf" hidden
          onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
        {!previewUrl && (
          <div>
            {previewNote ? (
              <div><div><b>{previewNote}</b> uploaded</div><div className="hint">Text extracted from the PDF's text layer</div></div>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
                <div><b>Click to upload</b> or drag a photo or PDF here</div>
                <div className="hint">JPG, PNG or PDF &middot; runs Tesseract OCR automatically</div>
              </>
            )}
          </div>
        )}
        {previewUrl && <img src={previewUrl} alt="Preview" />}
      </div>
      <div className="ocr-status" style={{ color: ocrStatus.color }}>{ocrStatus.text}</div>

      <div className="form-grid">
        <div className="form-field"><label>Subject / Exam</label><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. CS-402 Operating Systems" /></div>
        <div className="form-field"><label>Language</label>
          <select className="form-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en">English</option><option value="ur">Urdu</option>
          </select>
        </div>
        <div className="form-field span-2"><label>Question <span className="hint">auto-extracted by AI from the uploaded page &mdash; editable</span></label>
          <textarea dir="auto" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Auto-filled after upload (or type/paste directly)" /></div>
        <div className="form-field"><label>Max Marks</label><input type="number" value={maxMarks} min="1" step="0.5" onChange={(e) => setMaxMarks(e.target.value)} /></div>
        <div className="form-field"><label>OCR Confidence <span className="hint">(0-1)</span></label><input type="number" value={ocrConfidence} min="0" max="1" step="0.01" onChange={(e) => setOcrConfidence(e.target.value)} /></div>
        <div className="form-field span-2"><label>Marking Scheme <span className="hint">(optional)</span></label><textarea dir="auto" value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="e.g. 2 marks for definition, 3 marks for example" /></div>
        <div className="form-field span-2"><label>Official Answer Key <span className="hint">(optional)</span></label><textarea dir="auto" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Leave blank to let the Solution Agent generate one" /></div>
        <div className="form-field span-2"><label>Student's Answer (OCR Text) <span className="hint">auto-filled from photo &mdash; editable</span></label>
          <textarea dir="auto" style={{ minHeight: 120 }} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Upload a photo above, or type/paste the answer directly" /></div>
      </div>

      <div className="upload-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={submitting} onClick={submit}>{submitting ? "Submitting..." : "Submit & Mark with AI"}</button>
      </div>
    </div>
  );
}
