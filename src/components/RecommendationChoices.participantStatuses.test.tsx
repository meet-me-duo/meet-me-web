import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecommendationChoices } from "./RecommendationChoices";
import type { RecommendationVariantView } from "./recommendationView";

afterEach(cleanup);

const remote: RecommendationVariantView = {
  id: "remote", startAt: "2026-11-20T10:00:00Z", endAt: "2026-11-20T12:00:00Z",
  attendanceCount: 2, totalParticipants: 4, meetingMode: "REMOTE", place: null,
  excludedParticipantNames: ["다온", "라온"], participantStatuses: [
    { participantRef: "p1", displayName: "가람", status: "AVAILABLE" },
    { participantRef: "p2", displayName: "나래", status: "AVAILABLE" },
    { participantRef: "p3", displayName: "다온", status: "UNAVAILABLE" },
    { participantRef: "p4", displayName: "라온", status: "UNKNOWN" },
  ],
};

function setup(variants = [remote], canConfirm = true) {
  const onConfirm = vi.fn();
  render(<RecommendationChoices contextKey="synthetic-statuses" options={[{ id: "window", rank: 1, variants }]} timeZone="Asia/Seoul" canConfirm={canConfirm} onConfirm={onConfirm} />);
  return onConfirm;
}

it("shows server availability separately from matching exclusion, keeping unknown distinct from unavailability", () => {
  setup();
  const rows = within(screen.getByRole("list", { name: "참가자별 가능 여부" })).getAllByRole("listitem");
  expect(rows.map(row => row.textContent)).toEqual(["가람가능", "나래가능", "다온불가", "라온확인 필요"]);
  expect(rows[3]).not.toHaveTextContent("불가");
  expect(screen.getByText(/확인 필요: 일정이나 장소 조건/)).toBeVisible();
  expect(screen.queryByText(/분석 실패/)).not.toBeInTheDocument();
  expect(screen.queryByText(/님을 제외한/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /더보기|접기/ })).not.toBeInTheDocument();
});

it("keeps each mode's statuses outside the radio name and carries only the chosen mode into the time editor", () => {
  setup([{ ...remote, id: "local", meetingMode: "IN_PERSON", place: "합성 장소", participantStatuses: [{ participantRef: "p1", displayName: "가람", status: "UNAVAILABLE" }] }, { ...remote, participantStatuses: [{ participantRef: "p1", displayName: "가람", status: "UNKNOWN" }] }]);
  const rows = screen.getAllByRole("list").map(list => within(list).getByRole("listitem"));
  expect(rows[0]).toHaveTextContent("가람불가"); expect(rows[1]).toHaveTextContent("가람확인 필요");
  const online = screen.getByRole("radio", { name: /온라인/ });
  expect(online).not.toHaveAccessibleName(/가람/);
  fireEvent.click(online);
  fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
  expect(screen.getByRole("listitem")).toHaveTextContent("가람확인 필요");
  expect(screen.getByText("가능한 범위 전체 기준")).toBeVisible();
});

it("does not reinterpret participant statuses when selecting a shorter actual window or change the confirmation payload", () => {
  const onConfirm = setup();
  fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
  fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "2026-11-20T19:30" } });
  fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: "2026-11-20T20:00" } });
  expect(screen.getAllByRole("listitem")[3]).toHaveTextContent("라온확인 필요");
  fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ optionId: "window", variantId: "remote", startAt: "2026-11-20T10:30:00.000Z", endAt: "2026-11-20T11:00:00.000Z" });
});

it("preserves duplicate display names as separate participants and displays the same evidence in read-only mode", () => {
  setup([{ ...remote, participantStatuses: [{ participantRef: "p1", displayName: "같은 이름", status: "AVAILABLE" }, { participantRef: "p2", displayName: "같은 이름", status: "UNKNOWN" }] }], false);
  const rows = screen.getAllByRole("listitem");
  expect(rows).toHaveLength(2); expect(rows[0]).toHaveTextContent("같은 이름가능"); expect(rows[1]).toHaveTextContent("같은 이름확인 필요");
  expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
});

it("shows four participants initially, expands each variant independently, and keeps hidden unknowns discoverable", () => {
  const five = [...remote.participantStatuses!.map(person => ({ ...person, status: "AVAILABLE" as const })), { participantRef: "p5", displayName: "마루", status: "UNKNOWN" as const }];
  setup([{ ...remote, participantStatuses: five }, { ...remote, id: "other", participantStatuses: five }], false);
  const lists = screen.getAllByRole("list");
  const buttons = screen.getAllByRole("button", { name: "나머지 1명 더보기" });
  expect(within(lists[0]!).getAllByRole("listitem")).toHaveLength(4);
  expect(screen.queryByText("마루")).not.toBeInTheDocument();
  expect(screen.getAllByText(/확인 필요: 일정이나 장소 조건/)).toHaveLength(2);
  expect(buttons[0]).toHaveAttribute("aria-controls", lists[0]!.id);
  expect(buttons[1]).toHaveAttribute("aria-controls", lists[1]!.id);
  expect(lists[0]!.id).not.toBe(lists[1]!.id);
  fireEvent.click(buttons[0]!);
  expect(buttons[0]).toHaveAttribute("aria-expanded", "true");
  expect(within(lists[0]!).getAllByRole("listitem")).toHaveLength(5);
  expect(within(lists[1]!).getAllByRole("listitem")).toHaveLength(4);
  expect(within(lists[0]!).getAllByRole("listitem")[4]).toHaveTextContent("마루확인 필요");
  fireEvent.click(screen.getByRole("button", { name: "접기" }));
  expect(buttons[0]).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("마루")).not.toBeInTheDocument();
});

it("moves conditional guidance below the list, without duplicating it, and preserves the legacy fallback", () => {
  const summary = "장소·이동 조건을 확인해 주세요.";
  setup([{ ...remote, attendanceConfirmed: false, summary }]);
  const list = screen.getByRole("list");
  const notice = screen.getByText(summary);
  expect(list.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText(/확인 필요: 일정이나 장소 조건/)).not.toBeInTheDocument();
  expect(screen.getByText("2/4명 시간 일치")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
  expect(screen.getByRole("list").compareDocumentPosition(screen.getByText(summary)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  cleanup();
  setup([{ ...remote, attendanceConfirmed: false, summary, participantStatuses: undefined }]);
  expect(screen.getByText(new RegExp(summary))).toBeVisible();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
