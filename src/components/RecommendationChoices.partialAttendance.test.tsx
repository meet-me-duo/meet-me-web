import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecommendationChoices } from "./RecommendationChoices";
import type { RecommendationOptionView, RecommendationVariantView } from "./recommendationView";

afterEach(cleanup);

type PartialAttendanceView = RecommendationVariantView & { availableParticipantNames?: string[] };

function variant(overrides: Partial<PartialAttendanceView> = {}): PartialAttendanceView {
  return {
    id: "synthetic-online-two-of-five", startAt: "2026-10-21T10:00:00Z", endAt: "2026-10-21T12:00:00Z",
    attendanceCount: 2, totalParticipants: 5, meetingMode: "REMOTE", place: null,
    availableParticipantNames: ["가온", "나래"], excludedParticipantNames: ["민수", "다온", "라온"], ...overrides,
  };
}

function setup(variants: PartialAttendanceView[] = [variant()]) {
  const options: RecommendationOptionView[] = [{ id: "synthetic-wednesday-window", rank: 1, variants }];
  const onConfirm = vi.fn();
  return { ...render(<RecommendationChoices contextKey="synthetic-analysis:host" options={options} timeZone="Asia/Seoul" canConfirm onConfirm={onConfirm} />), onConfirm };
}

describe("actual partial attendance rather than a maximum-two-exclusions plan", () => {
  it("shows the actual two-of-five count and all three excluded names beside their offered time", () => {
    setup();
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent(/2\s*\/\s*5명 참석 가능/);
    expect(card).toHaveTextContent("참석 가능 · 가온 님, 나래 님");
    expect(card).toHaveTextContent("이 조합에서 제외 · 민수 님, 다온 님, 라온 님");
    expect(card).toHaveTextContent("민수"); expect(card).toHaveTextContent("다온"); expect(card).toHaveTextContent("라온");
    expect(card).toHaveTextContent(/제외/);
    expect(card).toHaveTextContent(/19:00.*21:00/);
    expect(card).toHaveTextContent("온라인");
    expect(within(card).queryByText(/대면/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Plan [ABC]/)).not.toBeInTheDocument();
  });

  it("retains the selected variant's actual excluded names in the real-time selection form", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" })); fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement).toHaveTextContent(/2\s*\/\s*5명 참석 가능/);
    const section = screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement!;
    expect(section).toHaveTextContent("참석 가능 · 가온 님, 나래 님");
    expect(section).toHaveTextContent("민수"); expect(section).toHaveTextContent("다온"); expect(section).toHaveTextContent("라온");
    expect(section).toHaveTextContent(/제외/);
    expect(section).toHaveTextContent(/19:00.*21:00/);
  });

  it("does not carry another variant's excluded names into a full-attendance choice", () => {
    setup([variant({ id: "all-five", attendanceCount: 5, availableParticipantNames: ["온유", "시온", "유하", "하루", "보라"], excludedParticipantNames: [] }), variant()]);
    fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" })); fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
    const section = screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement!;
    expect(section).toHaveTextContent(/5\s*\/\s*5명 참석 가능/);
    expect(section).toHaveTextContent("온유 님, 시온 님, 유하 님, 하루 님, 보라 님");
    expect(section).not.toHaveTextContent("가온");
    expect(section).not.toHaveTextContent("민수"); expect(section).not.toHaveTextContent("다온"); expect(section).not.toHaveTextContent("라온");
    expect(section).not.toHaveTextContent(/제외/);
  });

  it("preserves every excluded name when only two of fifty participants can attend", () => {
    const excluded = Array.from({ length: 48 }, (_, index) => `합성 제외 참여자 ${index + 1}`);
    setup([variant({ totalParticipants: 50, excludedParticipantNames: excluded })]);
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent(/2\s*\/\s*50명 참석 가능/);
    for (const name of excluded) expect(card).toHaveTextContent(name);
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("renders participant names as text without interpreting markup", () => {
    const name = '<img src="x" onerror="syntheticAttack()">';
    const { container } = setup([variant({ attendanceCount: 4, availableParticipantNames: [name, "동명", "동명", "가온"], excludedParticipantNames: [name] })]);
    expect(screen.getByRole("article")).toHaveTextContent(name);
    expect(container.querySelector("img")).toBeNull();
  });

  it("accepts older presentation payloads without inventing excluded participant names", () => {
    const older = variant(); delete older.excludedParticipantNames; delete older.availableParticipantNames;
    setup([older]);
    expect(screen.getByRole("article")).toHaveTextContent(/2\s*\/\s*5명 참석 가능/);
    expect(screen.getByRole("article")).not.toHaveTextContent(/undefined|null|가온|나래|민수|다온|라온/);
    fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" })); fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
    expect(screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement).not.toHaveTextContent(/undefined|null/);
  });

  it("shows time-matched names and keeps place uncertainty separate from excluded membership", () => {
    setup([variant({ attendanceConfirmed: false })]);
    const card = screen.getByRole("article");
    expect(card).toHaveTextContent("시간 조건 일치 · 가온 님, 나래 님");
    expect(card).toHaveTextContent("장소·이동 조건을 확인하지 못해 실제 참석 여부는 미확정");
    expect(card).toHaveTextContent("이 조합에서 제외 · 민수 님, 다온 님, 라온 님");
    expect(card).not.toHaveTextContent("참석 불가");
  });

  it("keeps duplicate display names and switches to the selected variant's names", () => {
    setup([variant(), variant({ id: "second", availableParticipantNames: ["동명", "동명"], excludedParticipantNames: ["가온", "나래", "라온"] })]);
    fireEvent.click(screen.getAllByRole("radio")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "이 시간 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
    const section = screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement!;
    expect(section).toHaveTextContent("참석 가능 · 동명 님, 동명 님");
    expect(section).not.toHaveTextContent("참석 가능 · 가온");
    fireEvent.click(screen.getByRole("button", { name: "추천안으로 돌아가기" }));
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
    expect(screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement!).toHaveTextContent("참석 가능 · 가온 님, 나래 님");
    expect(screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement!).not.toHaveTextContent("동명");
  });

  it("shows each alternative's own names when additional times are opened", () => {
    render(<RecommendationChoices contextKey="alternative" options={[{ id: "one", rank: 1, variants: [variant()] }]} alternatives={[{ id: "other", rank: 1, variants: [variant({ id: "other-variant", availableParticipantNames: ["온유", "시온"] })] }]} timeZone="Asia/Seoul" canConfirm onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" }));
    const other = screen.getAllByRole("article")[1]!;
    expect(other).toHaveTextContent("참석 가능 · 온유 님, 시온 님");
    fireEvent.click(within(other).getByRole("button", { name: "이 시간 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 시간 확정하기" }));
    expect(screen.getByRole("heading", { name: /실제 일정 선택/ }).parentElement!).toHaveTextContent("참석 가능 · 온유 님, 시온 님");
  });

  it("explains that offered time options have no display hierarchy or mode-based Plan A B C meaning", () => {
    setup();
    expect(screen.getByText(/우열.*없는.*시간.*선택지/)).toBeInTheDocument();
    expect(screen.queryByText(/최적안|차선안|최대\s*2명\s*제외/)).not.toBeInTheDocument();
  });
});
