import { describe, expect, it } from "vitest";
import { initials } from "./icons";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Demo Teacher")).toBe("DT");
  });
  it("uppercases lowercase names", () => {
    expect(initials("jane doe")).toBe("JD");
  });
  it("handles a single-word name", () => {
    expect(initials("Cher")).toBe("C");
  });
  it("ignores extra whitespace between words", () => {
    expect(initials("  Demo   Teacher  ")).toBe("DT");
  });
  it("only uses the first two words for a longer name", () => {
    expect(initials("Ali Ahmed Khan")).toBe("AA");
  });
  it("falls back to '?' for an empty or missing name", () => {
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
  });
});
