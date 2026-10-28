import { describe, expect, it } from "vitest";
import { currentRoom } from "./recovery";
import { decodeReviewSupport } from "./reviewSupport";
import type { Room } from "./types";

const base = {
  invite_code: "abcdefghijklmnopqrstuv", public_status: "CONFIRMED", state_version: 10,
  viewer: { joined: true, role: "MEMBER", display_name: "합성 참여자" },
} as Room;

const fields: { name: string; value: unknown }[] = [
  { name: "missing", value: undefined }, { name: "false", value: false }, { name: "string", value: "true" },
  { name: "number", value: 1 }, { name: "null", value: null }, { name: "object", value: { enabled: true } }, { name: "array", value: [true] },
];

describe("optional review API support decoding", () => {
  it("accepts literal true and preserves the rest of the room", () => {
    const wire = { ...base, review_prompt_supported: true };
    expect(decodeReviewSupport(wire)).toEqual(wire);
  });

  it.each(fields)("fails closed for $name", ({ value }) => {
    const wire = { ...base };
    if (value !== undefined) Object.assign(wire, { review_prompt_supported: value });
    const decoded = decodeReviewSupport(wire);
    expect(decoded.review_prompt_supported === true).toBe(false);
    expect(decoded.invite_code).toBe(base.invite_code); expect(decoded.viewer).toEqual(base.viewer);
    if (value === undefined) expect(Object.hasOwn(decoded, "review_prompt_supported")).toBe(false);
    else expect(decoded.review_prompt_supported).toBe(false);
  });

  it.each(fields)("a stale business version cannot retain previous support when the latest response is $name", ({ value }) => {
    const previous = { ...base, review_prompt_supported: true };
    const incoming = { ...base, state_version: 9 };
    if (value !== undefined) Object.assign(incoming, { review_prompt_supported: value });
    const current = currentRoom(previous, incoming);
    expect(current.state_version).toBe(10);
    expect(current.review_prompt_supported).toBe(false);
    expect(previous.review_prompt_supported).toBe(true);
  });
});
