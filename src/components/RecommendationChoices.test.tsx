import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecommendationChoices } from "./RecommendationChoices";
import type { RecommendationOptionView } from "./recommendationView";

afterEach(cleanup);

// Presentation fixtures are deliberately independent of any future API DTO.
const options: RecommendationOptionView[] = [
  { id: "oct8", rank: 1, variants: [
    { id: "seoul", startAt: "2026-10-08T01:00:00Z", endAt: "2026-10-08T05:00:00Z", attendanceCount: 4, totalParticipants: 4, meetingMode: "IN_PERSON", place: "강남" },
    { id: "online", startAt: "2026-10-08T01:00:00Z", endAt: "2026-10-08T05:00:00Z", attendanceCount: 3, totalParticipants: 4, meetingMode: "REMOTE", place: null },
  ] },
  { id: "oct9", rank: 2, variants: [
    { id: "second", startAt: "2026-10-09T03:00:00Z", endAt: "2026-10-09T07:00:00Z", attendanceCount: 2, totalParticipants: 4, meetingMode: "IN_PERSON", place: "잠실" },
  ] },
  { id: "oct10", rank: 3, variants: [
    { id: "third", startAt: "2026-10-10T04:00:00Z", endAt: "2026-10-10T08:00:00Z", attendanceCount: 4, totalParticipants: 4, meetingMode: "IN_PERSON", place: "홍대" },
  ] },
];

const fourthOption: RecommendationOptionView = { id: "oct11", rank: 4, variants: [
  { id: "fourth", startAt: "2026-10-11T05:00:00Z", endAt: "2026-10-11T09:00:00Z", attendanceCount: 3, totalParticipants: 4, meetingMode: "IN_PERSON", place: "건대" },
] };

function setup(overrides: Partial<React.ComponentProps<typeof RecommendationChoices>> = {}) {
  const onConfirm = vi.fn();
  const props = { options, timeZone: "Asia/Seoul", contextKey: "analysis-one:owner", canConfirm: true, onConfirm, ...overrides };
  return { ...render(<RecommendationChoices {...props} />), props, onConfirm };
}

function selectOption(index = 0) {
  fireEvent.click(screen.getAllByRole("button", { name: "이 시간 선택" })[index]!);
}

function fillTime(start = "2026-10-08T10:30", end = "2026-10-08T11:15") {
  fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: start } });
  fireEvent.change(screen.getByLabelText("종료 시간"), { target: { value: end } });
}

describe("#19 recommendations as distinct offered times", () => {
  it("renders one possible option once rather than padding it to three plans", () => {
    setup({ options: [options[0]!] });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "이 시간 선택" })).toHaveLength(1);
    expect(screen.queryByText(/Plan [ABC]/)).not.toBeInTheDocument();
  });
  it("shows three actual date/time choices even when each has an in-person variant", () => {
    setup();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent("10:00");
    expect(cards[1]).toHaveTextContent("12:00");
    expect(cards[2]).toHaveTextContent("13:00");
    expect(cards[0]).toHaveTextContent("14:00");
    expect(cards[1]).toHaveTextContent("16:00");
    expect(cards[2]).toHaveTextContent("17:00");
    for (const card of cards) expect(card).toHaveTextContent("대면");
  });
  it("labels each variant with its own attendance, place, mode and offered range", () => {
    setup({ options: [options[0]!] });
    const local = screen.getByRole("radio", { name: /대면.*강남|강남.*대면/ });
    const remote = screen.getByRole("radio", { name: /온라인/ });
    expect(local).toHaveAccessibleName(/4\s*\/\s*4/);
    expect(remote).toHaveAccessibleName(/3\s*\/\s*4/);
    expect(local).toHaveAccessibleName(/10:00.*14:00/);
    expect(remote).toHaveAccessibleName(/10:00.*14:00/);
    expect(within(screen.getByRole("article")).getByText(/강남/)).toBeInTheDocument();
  });
  it("does not create any option for an empty result", () => {
    setup({ options: [] });
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
  });
  it("exposes other possible times only through an explicit accessible action", () => {
    const onLoadMore = vi.fn();
    const view = setup({ hasMore: true, onLoadMore });
    expect(onLoadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    view.rerender(<RecommendationChoices {...view.props} loadingMore />);
    const action = screen.getByRole("button", { name: /다른 가능한 시간|불러오는 중/ });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
  it("hides the alternatives action when there are no more possible times", () => {
    setup({ hasMore: false, onLoadMore: vi.fn() });
    expect(screen.queryByRole("button", { name: "다른 가능한 시간 보기" })).not.toBeInTheDocument();
  });
  it("limits primary recommendations to three and reveals overflow only on explicit request", () => {
    setup({ options: [...options, fourthOption] });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "다른 가능한 시간 4" })).not.toBeInTheDocument();
    expect(screen.queryByText(/건대/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "다른 가능한 시간 4" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "추천안 4" })).not.toBeInTheDocument();
    expect(screen.getByText(/건대/)).toBeInTheDocument();
  });
  it("blocks an immediate duplicate alternatives request while its promise is unresolved", () => {
    const onLoadMore = vi.fn(() => new Promise<void>(() => {}));
    setup({ hasMore: true, onLoadMore });
    const load = screen.getByRole("button", { name: "다른 가능한 시간 보기" });
    fireEvent.click(load); fireEvent.click(load);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /다른 가능한 시간/ })).toBeDisabled();
  });
});

describe("#19 actual meeting selection", () => {
  it("starts with two blank inputs and never confirms just by choosing a card", () => {
    const { onConfirm } = setup();
    selectOption();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("does not fill an assumed end time after the user chooses a start", () => {
    setup(); selectOption();
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "2026-10-08T10:30" } });
    expect(screen.getByLabelText("종료 시간")).toHaveValue("");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
  });
  it("confirms a user-chosen short interval with exact option and variant identities", () => {
    const { onConfirm } = setup(); selectOption(); fillTime();
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ optionId: "oct8", variantId: "seoul", startAt: "2026-10-08T01:30:00.000Z", endAt: "2026-10-08T02:15:00.000Z" });
  });
  it("confirms the explicitly selected online variant rather than the first variant", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /온라인/ })); selectOption(); fillTime();
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ optionId: "oct8", variantId: "online" }));
  });
  it.each([
    ["2026-10-08T09:59", "2026-10-08T11:00"],
    ["2026-10-08T10:30", "2026-10-08T14:01"],
    ["2026-10-08T11:00", "2026-10-08T11:00"],
    ["2026-10-08T12:00", "2026-10-08T11:00"],
  ])("blocks invalid/out-of-range meeting time %s → %s", (start, end) => {
    const { onConfirm } = setup(); selectOption(); fillTime(start, end);
    const confirm = screen.getByRole("button", { name: "일정 확정" });
    expect(confirm).toBeDisabled(); fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("allows the exact full offered interval", () => {
    const { onConfirm } = setup(); selectOption(); fillTime("2026-10-08T10:00", "2026-10-08T14:00");
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ startAt: "2026-10-08T01:00:00.000Z", endAt: "2026-10-08T05:00:00.000Z" }));
  });
  it("returns to the cards and starts fresh when another date is selected", () => {
    const { onConfirm } = setup(); selectOption(); fillTime();
    fireEvent.click(screen.getByRole("button", { name: "추천안으로 돌아가기" }));
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    selectOption(1);
    expect(screen.getByLabelText("시작 시간")).toHaveValue("");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("");
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("blocks repeated confirmation and back navigation while pending", () => {
    const view = setup(); selectOption(); fillTime();
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    view.rerender(<RecommendationChoices {...view.props} pending />);
    const confirm = screen.getByRole("button", { name: /확정 중|일정 확정/ });
    expect(confirm).toBeDisabled(); fireEvent.click(confirm);
    expect(screen.getByRole("button", { name: "추천안으로 돌아가기" })).toBeDisabled();
    expect(view.onConfirm).toHaveBeenCalledTimes(1);
  });
  it("keeps recommendations readable without exposing a confirmation action to members", () => {
    const { onConfirm } = setup({ canConfirm: false });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "일정 확정" })).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("discards stale selection when analysis/viewer context changes even with identical option ids", () => {
    const view = setup(); selectOption(); fillTime();
    view.rerender(<RecommendationChoices {...view.props} contextKey="analysis-two:owner" />);
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "일정 확정" })).not.toBeInTheDocument();
    expect(view.onConfirm).not.toHaveBeenCalled();
  });
  it("discards a selected recommendation that is removed by a fresh result", () => {
    const view = setup(); selectOption(); fillTime();
    view.rerender(<RecommendationChoices {...view.props} options={[options[1]!]} />);
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "일정 확정" })).not.toBeInTheDocument();
    expect(view.onConfirm).not.toHaveBeenCalled();
  });
  it("cannot confirm an already-open form after confirmation capability is revoked", () => {
    const view = setup(); selectOption(); fillTime();
    view.rerender(<RecommendationChoices {...view.props} canConfirm={false} />);
    const button = screen.queryByRole("button", { name: "일정 확정" });
    if (button) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(view.onConfirm).not.toHaveBeenCalled();
  });
  it("blocks a second immediate click while the first confirmation promise is unresolved", () => {
    const onConfirm = vi.fn(() => new Promise<void>(() => {}));
    setup({ onConfirm }); selectOption(); fillTime();
    const confirm = screen.getByRole("button", { name: "일정 확정" });
    fireEvent.click(confirm); fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /확정 중/ })).toBeDisabled();
    expect(screen.getByLabelText("시작 시간")).toBeDisabled();
    expect(screen.getByLabelText("종료 시간")).toBeDisabled();
  });
  it("moves keyboard focus to the actual-time form and restores the triggering card on back", () => {
    setup(); selectOption(1);
    expect(screen.getByRole("heading", { name: /실제 일정 선택/ })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "추천안으로 돌아가기" }));
    expect(screen.getAllByRole("button", { name: "이 시간 선택" })[1]).toHaveFocus();
  });
  it("rejects a nonexistent DST time instead of silently shifting it forward", () => {
    const dstOptions: RecommendationOptionView[] = [{ id: "spring", rank: 1, variants: [
      { id: "spring-local", startAt: "2026-03-08T05:00:00Z", endAt: "2026-03-08T10:00:00Z", attendanceCount: 2, totalParticipants: 2, meetingMode: "IN_PERSON", place: "뉴욕" },
    ] }];
    const { onConfirm } = setup({ options: dstOptions, timeZone: "America/New_York" });
    selectOption(); fillTime("2026-03-08T02:30", "2026-03-08T03:30");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/존재하지 않/);
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("requires explicit UTC offsets for both ambiguous DST times", () => {
    const dstOptions: RecommendationOptionView[] = [{ id: "fall", rank: 1, variants: [
      { id: "fall-local", startAt: "2026-11-01T04:00:00Z", endAt: "2026-11-01T08:00:00Z", attendanceCount: 2, totalParticipants: 2, meetingMode: "REMOTE", place: null },
    ] }];
    const { onConfirm } = setup({ options: dstOptions, timeZone: "America/New_York" });
    selectOption(); fillTime("2026-11-01T01:15", "2026-11-01T01:45");
    const startOffset = screen.getByRole("combobox", { name: "시작 시간의 UTC 오프셋" });
    const endOffset = screen.getByRole("combobox", { name: "종료 시간의 UTC 오프셋" });
    expect(startOffset).toHaveValue(""); expect(endOffset).toHaveValue("");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
    expect(within(startOffset).getByRole("option", { name: /UTC-04:00/ })).toBeInTheDocument();
    expect(within(endOffset).getByRole("option", { name: /UTC-05:00/ })).toBeInTheDocument();
    fireEvent.change(startOffset, { target: { value: "2026-11-01T05:15:00.000Z" } });
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
    fireEvent.change(endOffset, { target: { value: "2026-11-01T06:45:00.000Z" } });
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(onConfirm).toHaveBeenCalledWith({ optionId: "fall", variantId: "fall-local", startAt: "2026-11-01T05:15:00.000Z", endAt: "2026-11-01T06:45:00.000Z" });
  });
  it("preserves current input and keyboard focus when an unrelated option changes", () => {
    const view = setup(); selectOption(); fillTime();
    const start = screen.getByLabelText("시작 시간"); start.focus();
    const updatedOptions = options.map(option => option.id === "oct9" ? {
      ...option, variants: option.variants.map(variant => ({ ...variant, place: "판교" })),
    } : option);
    view.rerender(<RecommendationChoices {...view.props} options={updatedOptions} />);
    expect(screen.queryByLabelText("시작 시간")).toBe(start);
    expect(start).toHaveFocus();
    expect(start).toHaveValue("2026-10-08T10:30");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("2026-10-08T11:15");
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(view.onConfirm).toHaveBeenCalledWith({ optionId: "oct8", variantId: "seoul", startAt: "2026-10-08T01:30:00.000Z", endAt: "2026-10-08T02:15:00.000Z" });
  });
  it("falls back to an available variant when a fresh result removes the selected radio variant", () => {
    const view = setup();
    fireEvent.click(screen.getByRole("radio", { name: /온라인/ }));
    expect(screen.getByRole("radio", { name: /온라인/ })).toBeChecked();
    const updatedOptions = options.map(option => option.id === "oct8" ? {
      ...option, variants: option.variants.filter(variant => variant.id !== "online"),
    } : option);
    view.rerender(<RecommendationChoices {...view.props} options={updatedOptions} />);
    expect(screen.queryByRole("radio", { name: /온라인/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /대면.*강남|강남.*대면/ })).toBeChecked();
    selectOption();
    expect(screen.queryByLabelText("시작 시간")).toBeInTheDocument();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("");
    fillTime(); fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(view.onConfirm).toHaveBeenCalledWith({ optionId: "oct8", variantId: "seoul", startAt: "2026-10-08T01:30:00.000Z", endAt: "2026-10-08T02:15:00.000Z" });
  });
  it("preserves an open form while an alternatives page arrives and exposes it after returning", () => {
    const view = setup({ alternatives: [] }); selectOption(); fillTime();
    const end = screen.getByLabelText("종료 시간"); end.focus();
    view.rerender(<RecommendationChoices {...view.props} alternatives={[fourthOption]} />);
    expect(screen.getByLabelText("종료 시간")).toBe(end);
    expect(end).toHaveFocus();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("2026-10-08T10:30");
    expect(end).toHaveValue("2026-10-08T11:15");
    expect(view.onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "추천안으로 돌아가기" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "다른 가능한 시간 보기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다른 가능한 시간 보기" }));
    expect(screen.getByRole("heading", { name: "다른 가능한 시간 4" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
  it("discards the actual-time form when its selected variant range changes", () => {
    const view = setup(); selectOption(); fillTime();
    const updatedOptions = options.map(option => option.id === "oct8" ? {
      ...option, variants: option.variants.map(variant => variant.id === "seoul" ? { ...variant, startAt: "2026-10-08T03:00:00Z" } : variant),
    } : option);
    view.rerender(<RecommendationChoices {...view.props} options={updatedOptions} />);
    expect(screen.queryByLabelText("시작 시간")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "일정 확정" })).not.toBeInTheDocument();
    expect(view.onConfirm).not.toHaveBeenCalled();
  });
  it.each([
    ["2026-10-08T09:59", "2026-10-08T11:00", "시작 시간"],
    ["2026-10-08T10:30", "2026-10-08T14:01", "종료 시간"],
    ["2026-10-08T12:00", "2026-10-08T11:00", "종료 시간"],
  ])("marks an invalid range or reversed interval as invalid for assistive technology (%s → %s)", (start, end, invalidField) => {
    const { onConfirm } = setup(); selectOption(); fillTime(start, end);
    expect(screen.getByLabelText(invalidField)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("explicitly selects and previews the whole offered microsecond range without truncating either boundary", () => {
    const preciseOptions = options.map(option => option.id === "oct8" ? {
      ...option, variants: option.variants.map(variant => ({ ...variant, startAt: "2026-10-08T01:00:00.000001Z", endAt: "2026-10-08T01:00:00.000002Z" })),
    } : option);
    const { onConfirm } = setup({ options: preciseOptions }); selectOption();
    expect(screen.getByLabelText("시작 시간")).toHaveValue("");
    expect(screen.getByLabelText("종료 시간")).toHaveValue("");
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "가능한 범위 전체 선택" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "가능한 범위 전체 선택" }));
    expect(screen.getByText(/확정할 일정/)).toHaveTextContent(/10:00:00\.000001.*10:00:00\.000002/);
    fireEvent.click(screen.getByRole("button", { name: "일정 확정" }));
    expect(onConfirm).toHaveBeenCalledWith({ optionId: "oct8", variantId: "seoul", startAt: "2026-10-08T01:00:00.000001Z", endAt: "2026-10-08T01:00:00.000002Z" });
  });
  it("drops the whole-range selection when the user manually edits a time outside the offered range", () => {
    const { onConfirm } = setup(); selectOption();
    expect(screen.queryByRole("button", { name: "가능한 범위 전체 선택" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "가능한 범위 전체 선택" }));
    expect(screen.getByRole("button", { name: "일정 확정" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("시작 시간"), { target: { value: "2026-10-08T09:00" } });
    const confirm = screen.getByRole("button", { name: "일정 확정" });
    expect(confirm).toBeDisabled(); fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
