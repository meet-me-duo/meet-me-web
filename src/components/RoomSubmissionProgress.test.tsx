import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RoomSubmissionProgress } from "./RoomSubmissionProgress";

afterEach(cleanup);

describe("submission aggregate presentation", () => {
  it("describes submitted people, rather than accepted conditions or analysis completion", () => {
    render(<RoomSubmissionProgress submittedCount={2} expectedParticipants={4} closed={false} />);
    expect(screen.getByRole("img", { name: "입력 수집 중 · 목표 4명 중 2명 제출" })).toHaveTextContent("2/4명");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it.each([[0, 4], [2, 4], [6, 4], [20, 20]])("shows only the fraction for a known target (%s/%s), retaining its accessible meaning", (submittedCount, expectedParticipants) => {
    const { container } = render(<RoomSubmissionProgress submittedCount={submittedCount} expectedParticipants={expectedParticipants} closed={false} />);
    const progress = screen.getByRole("img", { name: `입력 수집 중 · 목표 ${expectedParticipants}명 중 ${submittedCount}명 제출` });
    expect(progress.textContent).toBe(`${submittedCount}/${expectedParticipants}명`);
    expect(container.querySelector(".submission-progress-caption")).toBeNull();
  });
  it("retains the real numerator above capacity while bounding the visual arc", () => {
    const { container } = render(<RoomSubmissionProgress submittedCount={6} expectedParticipants={4} closed />);
    expect(screen.getByRole("img", { name: "입력 마감 · 목표 4명 중 6명 제출" })).toHaveTextContent("6/4명");
    expect(container.querySelector(".submission-progress-value")).toHaveAttribute("stroke-dasharray", "100 100");
  });
  it("distinguishes a known zero from missing data without a rounded dot of false progress", () => {
    const { container } = render(<RoomSubmissionProgress submittedCount={0} expectedParticipants={4} closed={false} />);
    expect(screen.getByRole("img", { name: /목표 4명 중 0명 제출/ })).toHaveTextContent("0/4명");
    expect(container.querySelector(".submission-progress-value")).toBeNull();
  });
  it.each([0, 2, 6])("uses a neutral count circle without a completion arc when no target exists (%s)", submittedCount => {
    const { container } = render(<RoomSubmissionProgress submittedCount={submittedCount} expectedParticipants={null} closed={false} />);
    expect(screen.getByRole("img", { name: `입력 수집 중 · ${submittedCount}명 제출, 목표 인원 없음` })).toHaveTextContent(`${submittedCount}명제출`);
    expect(container.querySelector(".submission-progress-value")).toBeNull();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
  it.each([undefined, null, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("does not manufacture a submitted count from %s", submittedCount => {
    const { container } = render(<RoomSubmissionProgress submittedCount={submittedCount} expectedParticipants={4} closed={false} />);
    expect(screen.getByRole("img", { name: "입력 수집 중 · 제출 인원 확인 불가" })).toHaveTextContent("—집계 미확인");
    expect(container.querySelector(".submission-progress-value")).toBeNull();
  });
  it.each([undefined, 0, -1, 1.5, Infinity, NaN])("does not divide by or treat an invalid target as intentional no-target (%s)", expectedParticipants => {
    const { container } = render(<RoomSubmissionProgress submittedCount={2} expectedParticipants={expectedParticipants} closed={false} />);
    expect(screen.getByRole("img", { name: "입력 수집 중 · 2명 제출, 목표 인원 확인 불가" })).toHaveTextContent("2명");
    expect(container.querySelector(".submission-progress-value")).toBeNull();
  });
  it("labels retained data as the last confirmed aggregate after a failed refresh", () => {
    render(<RoomSubmissionProgress submittedCount={2} expectedParticipants={4} closed stale />);
    expect(screen.getByRole("img", { name: "입력 마감 · 마지막 확인한 집계 · 목표 4명 중 2명 제출" })).toHaveTextContent("마지막 확인");
  });
  it("retains a truthful stale notice for a count without a target", () => {
    render(<RoomSubmissionProgress submittedCount={2} expectedParticipants={null} closed stale />);
    expect(screen.getByRole("img", { name: "입력 마감 · 마지막 확인한 집계 · 2명 제출, 목표 인원 없음" })).toHaveTextContent("2명마지막 확인");
  });
  it.each([[20, 20], [50, 50], [100, 50], [1000, 50]])("preserves the full %s/%s value using two central lines with the same number typography", (submittedCount, expectedParticipants) => {
    const { container } = render(<RoomSubmissionProgress submittedCount={submittedCount} expectedParticipants={expectedParticipants} closed />);
    expect(screen.getByRole("img", { name: `입력 마감 · 목표 ${expectedParticipants}명 중 ${submittedCount}명 제출` })).toHaveTextContent(`${submittedCount}/${expectedParticipants}명`);
    const number = container.querySelector(".submission-progress-number.is-stacked")!;
    expect([...number.children].map(span => span.textContent)).toEqual([`${submittedCount}/`, `${expectedParticipants}명`]);
    expect(container.querySelector(".submission-progress-caption")).toBeNull();
    expect(container.querySelector(".submission-progress-value")).toHaveAttribute("stroke-dasharray", "100 100");
  });
  it("keeps stale text outside a two-line ratio and retains its full contextual name", () => {
    render(<RoomSubmissionProgress submittedCount={20} expectedParticipants={20} closed stale />);
    const progress = screen.getByRole("img", { name: "입력 마감 · 마지막 확인한 집계 · 목표 20명 중 20명 제출" });
    expect(progress).toHaveTextContent("20/20명");
    const note = screen.getByText("마지막으로 확인한 제출 인원이에요.");
    expect(progress).not.toContainElement(note);
  });
});
