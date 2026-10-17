import { describe, expect, it } from "vitest";
import { createRoomBody, createRoomSchema, type CreateRoomValues } from "./createRoom";

const form: CreateRoomValues = {
  hostName: "회원", purpose: "계정으로 만드는 모임", meetingMode: "EITHER",
  customSearch: false, searchStart: "", searchEnd: "", useExpected: true,
  expectedParticipants: "4", useDeadline: false, deadline: "", manualOnly: false,
};

describe("issue #109 account profile name compatibility", () => {
  it.each(["가", "😀", "가".repeat(50), "😀".repeat(50)])("accepts a server-valid account display name of 1 to 50 Unicode code points: %#", (name) => {
    const parsed = createRoomSchema.safeParse({ ...form, hostName: `  ${name}  ` });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("server-valid account profile unexpectedly blocks room creation");
    expect(parsed.data.hostName).toBe(name);
    expect(createRoomBody(parsed.data)).not.toHaveProperty("host_display_name");
  });

  it.each(["", " \t\n ", "가".repeat(51), "😀".repeat(51)])("rejects blank or over-50-codepoint names without weakening the server limit: %#", (hostName) => {
    expect(createRoomSchema.safeParse({ ...form, hostName }).success).toBe(false);
  });
});
