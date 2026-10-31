import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecommendationChoices } from "./RecommendationChoices";

afterEach(cleanup);

it("keeps unverified place in the existing candidate description and actual-time selection without claiming attendance", () => {
  const summary = "3명의 시간 조건이 맞습니다. 일부 장소·이동 조건은 확인하지 못해 대면 참석 여부는 미확정입니다.";
  const onConfirm = vi.fn();
  render(<RecommendationChoices contextKey="conditional-one" timeZone="Asia/Seoul" canConfirm onConfirm={onConfirm} options={[{ id: "one", rank: 1, variants: [{ id: "pending", startAt: "2026-12-02T09:00:00Z", endAt: "2026-12-02T10:00:00Z", attendanceCount: 3, totalParticipants: 3, meetingMode: "IN_PERSON", place: null, attendanceConfirmed: false, summary }] }]} />);
  expect(screen.getByText(summary)).toBeInTheDocument();
  expect(screen.getByText("3/3명 시간 일치")).toBeInTheDocument();
  expect(screen.queryByText(/명 참석 가능/)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" }));
  expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
  expect(screen.getByText(summary)).toBeInTheDocument();
  expect(screen.queryByText(/명 참석 가능/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "가능한 범위 전체 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ optionId: "one", variantId: "pending", startAt: "2026-12-02T09:00:00Z", endAt: "2026-12-02T10:00:00Z" });
});


it("preserves old-server attendance display when the additive certainty and summary fields are absent", () => {
  render(<RecommendationChoices contextKey="historical-server" timeZone="Asia/Seoul" canConfirm onConfirm={vi.fn()} options={[{ id: "old", rank: 1, variants: [{ id: "historical", startAt: "2026-12-04T09:00:00Z", endAt: "2026-12-04T10:00:00Z", attendanceCount: 2, totalParticipants: 3, meetingMode: "IN_PERSON", place: "기존 장소" }] }]} />);
  expect(screen.getByText("2/3명 참석 가능")).toBeInTheDocument();
  expect(screen.queryByText(/시간 일치|미확정|미확인/)).not.toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
  expect(screen.getByText(/2\/3명 참석 가능.*기존 장소/)).toBeInTheDocument();
  expect(screen.getByLabelText("시작 시간")).toBeInTheDocument();
});
