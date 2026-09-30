import { describe, expect, it } from "vitest";
import { statusClass, statusLabelFor, actionLabelFor, dashboardBucket, gradingBand } from "./helpers";

describe("statusClass", () => {
  it("flags second-marking above any decision", () => {
    expect(statusClass({ triggers_second_marking: true, teacher_decision: "accept" })).toBe("status-flag");
  });
  it("maps accept/adjust/flag to their own classes", () => {
    expect(statusClass({ teacher_decision: "accept" })).toBe("status-accept");
    expect(statusClass({ teacher_decision: "adjust" })).toBe("status-adjust");
    expect(statusClass({ teacher_decision: "flag" })).toBe("status-flag");
  });
  it("defaults to pending when no decision exists yet", () => {
    expect(statusClass({ teacher_decision: null })).toBe("status-pending");
  });
});

describe("statusLabelFor", () => {
  it("shows SECOND MARKING when flagged, even over a real decision", () => {
    expect(statusLabelFor({ triggers_second_marking: true, teacher_decision: "accept" })).toBe("SECOND MARKING");
  });
  it("uppercases the teacher's decision", () => {
    expect(statusLabelFor({ teacher_decision: "adjust" })).toBe("ADJUST");
  });
  it("shows PENDING when nothing has happened yet", () => {
    expect(statusLabelFor({ teacher_decision: null })).toBe("PENDING");
  });
});

describe("actionLabelFor", () => {
  it("shows REVW for papers needing second marking", () => {
    expect(actionLabelFor({ triggers_second_marking: true })).toBe("REVW");
  });
  it("shows VIEW once a decision exists (and isn't flagged)", () => {
    expect(actionLabelFor({ teacher_decision: "accept" })).toBe("VIEW");
  });
  it("shows MARK for an undecided paper", () => {
    expect(actionLabelFor({ teacher_decision: null })).toBe("MARK");
  });
});

describe("dashboardBucket", () => {
  it("buckets a flagged decision or a triggered second-marking as 'flagged'", () => {
    expect(dashboardBucket({ teacher_decision: "flag" })).toBe("flagged");
    expect(dashboardBucket({ teacher_decision: "accept", triggers_second_marking: true })).toBe("flagged");
  });
  it("buckets any other decided paper as 'completed'", () => {
    expect(dashboardBucket({ teacher_decision: "accept" })).toBe("completed");
    expect(dashboardBucket({ teacher_decision: "adjust" })).toBe("completed");
  });
  it("buckets an undecided paper as 'active'", () => {
    expect(dashboardBucket({ teacher_decision: null })).toBe("active");
  });
});

describe("gradingBand", () => {
  it("classifies the standard bands correctly, including the boundaries", () => {
    expect(gradingBand(100)).toBe("Distinction");
    expect(gradingBand(90)).toBe("Distinction");
    expect(gradingBand(89)).toBe("Credit");
    expect(gradingBand(75)).toBe("Credit");
    expect(gradingBand(74)).toBe("Pass");
    expect(gradingBand(50)).toBe("Pass");
    expect(gradingBand(49)).toBe("Unsatisfactory");
    expect(gradingBand(0)).toBe("Unsatisfactory");
  });
});
