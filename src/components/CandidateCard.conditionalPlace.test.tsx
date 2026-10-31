import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CandidateCard } from "./CandidateCard";

afterEach(cleanup);
it("keeps the unverified place limitation and time-only count when rendering a legacy confirmation", () => {
  const summary = "시간 조건은 맞지만 이동 조건 미확인으로 실제 참석 여부는 미확정입니다.";
  render(<CandidateCard canConfirm={false} confirmed candidate={{ candidate_id: "saved", plan_type: "A", meeting_mode: "IN_PERSON", rank: 1, attendance_count: 2, total_participants: 2, time_ranges: [{ start_at: "2026-12-02T09:00:00Z", end_at: "2026-12-02T10:00:00Z" }], place: null, attendance_confirmed: false, summary }} />);
  expect(screen.getByRole("heading", { name: summary })).toBeInTheDocument();
  expect(screen.getByText("2/2명 시간 일치")).toBeInTheDocument();
  expect(screen.queryByText(/명 참석 가능/)).not.toBeInTheDocument();
});
