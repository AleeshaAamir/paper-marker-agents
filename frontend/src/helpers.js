export const FLAG_LABEL = {
  LOW_OCR_CONFIDENCE: "Low OCR confidence",
  LOW_MODEL_CONFIDENCE: "Low model confidence",
  INCONSISTENT_RUNS: "Runs disagreed",
  CRITIC_REJECTED: "Critic rejected",
  PROMPT_INJECTION_SUSPECTED: "Prompt injection suspected",
  EMPTY_ANSWER: "Empty answer",
  URDU_LOW_RESOURCE: "Urdu (low-resource flag)",
};

export const STATUS_LABEL = {
  AI_SCORED: "Pending Teacher Review",
  NEEDS_MANUAL_REVIEW: "Flagged for Manual Review",
  UNREADABLE: "Unreadable - Flagged for Manual Review",
};

export const DECISION_LABEL = {
  accept: "Reviewed - Accepted",
  adjust: "Reviewed - Mark Adjusted",
  flag: "Reviewed - Flagged for Second Marking",
};

export function statusClass(seg) {
  if (seg.triggers_second_marking) return "status-flag";
  if (seg.teacher_decision === "accept") return "status-accept";
  if (seg.teacher_decision === "adjust") return "status-adjust";
  if (seg.teacher_decision === "flag") return "status-flag";
  return "status-pending";
}

export function statusLabelFor(seg) {
  if (seg.triggers_second_marking) return "SECOND MARKING";
  return seg.teacher_decision ? seg.teacher_decision.toUpperCase() : "PENDING";
}

export function actionLabelFor(seg) {
  if (seg.triggers_second_marking) return "REVW";
  if (seg.teacher_decision) return "VIEW";
  return "MARK";
}

export function dashboardBucket(seg) {
  if (seg.teacher_decision === "flag" || seg.triggers_second_marking) return "flagged";
  if (seg.teacher_decision) return "completed";
  return "active";
}

export function gradingBand(pct) {
  if (pct >= 90) return "Distinction";
  if (pct >= 75) return "Credit";
  if (pct >= 50) return "Pass";
  return "Unsatisfactory";
}

export function exportCsv(filename, headers, rows) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
