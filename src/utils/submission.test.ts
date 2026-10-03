import { describe, expect, it } from "vitest";
import { submissionText } from "./submission";

const trimPoints = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, ...Array.from({ length: 11 }, (_, i) => 0x2000 + i), 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff];

describe("natural-language submission", () => {
  it.each(trimPoints)("trims ECMAScript whitespace U+%s at both ends", (point) => {
    const space = String.fromCodePoint(point);
    expect(submissionText(`${space}월요일  저녁${space}`).text).toBe("월요일  저녁");
    expect(submissionText(space).valid).toBe(false);
  });

  it.each([0x0085, 0x180e, 0x200b])( "preserves non-trim codepoint U+%s", (point) => {
    const value = String.fromCodePoint(point);
    expect(submissionText(`${value}월요일${value}`).text).toBe(`${value}월요일${value}`);
  });

  it("rejects empty input and counts trimmed Unicode codepoints rather than UTF-16 units", () => {
    expect(submissionText("")).toEqual({ text: "", length: 0, valid: false });
    expect(submissionText(` \u00a0${"😀".repeat(500)}\ufeff `)).toMatchObject({ length: 500, valid: true });
    expect(submissionText("😀".repeat(501))).toMatchObject({ length: 501, valid: false });
    expect(submissionText("가".repeat(500))).toMatchObject({ length: 500, valid: true });
    expect(submissionText("가".repeat(501))).toMatchObject({ length: 501, valid: false });
  });

  it("preserves internal whitespace and counts combining characters separately", () => {
    expect(submissionText("  월요일\n  저녁\u00a0가능  ").text).toBe("월요일\n  저녁\u00a0가능");
    expect(submissionText("e\u0301").length).toBe(2);
  });
});
