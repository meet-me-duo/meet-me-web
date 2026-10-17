import { describe, expect, it } from "vitest";
import { createRoomBody, type CreateRoomValues } from "./createRoom";

// #109: the authenticated server profile is the sole authority for a member HOST name.
// A legacy optional field is still validated by the server before it is ignored, so omit the key entirely.
describe("issue #109 member HOST profile authority", () => {
  it.each([
    ["normal account name", "회원 이름"],
    ["50 Unicode emoji account name", "😀".repeat(50)],
  ])("omits ignored legacy host name for %s while preserving the room form", (_description, hostName) => {
    const form: CreateRoomValues = {
      hostName,
      purpose: " 계정으로 만드는 모임 ",
      meetingMode: "EITHER",
      customSearch: false,
      searchStart: "",
      searchEnd: "",
      useExpected: true,
      expectedParticipants: "4",
      useDeadline: false,
      deadline: "",
      manualOnly: false,
    };
    expect(Array.from(hostName.trim()).length).toBeGreaterThan(0);
    expect(Array.from(hostName.trim()).length).toBeLessThanOrEqual(50);

    const body = createRoomBody(form);

    expect(body).not.toHaveProperty("host_display_name");
    expect(body).toEqual({
      purpose: "계정으로 만드는 모임",
      meeting_mode: "EITHER",
      expected_participants: 4,
      submission_deadline: null,
      manual_only: false,
      search_start_date: null,
      search_end_date: null,
    });
  });
});
