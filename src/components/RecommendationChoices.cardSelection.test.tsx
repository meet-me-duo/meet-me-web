import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecommendationChoices, type RecommendationChoicesProps } from "./RecommendationChoices";
import type { RecommendationOptionView, RecommendationVariantView } from "./recommendationView";

const variant: RecommendationVariantView = {
  id: "online", startAt: "2026-11-20T10:00:00Z", endAt: "2026-11-20T12:00:00Z", attendanceCount: 7, totalParticipants: 7, meetingMode: "REMOTE", place: null,
  participantStatuses: Array.from({ length: 7 }, (_, index) => ({ participantRef: `person-${index}`, displayName: index ? `합성 참가자 ${index + 1}` : "긴 닉네임 검토자", status: "AVAILABLE" })),
};
const options: RecommendationOptionView[] = [
  { id: "first", rank: 1, variants: [variant] },
  { id: "second", rank: 2, variants: [{ ...variant, id: "second-online" }] },
];
function setup(overrides: Partial<RecommendationChoicesProps> = {}) {
  const props = { contextKey: "synthetic-card-selection", options, timeZone: "Asia/Seoul", canConfirm: true, onConfirm: vi.fn(), ...overrides };
  return { ...render(<RecommendationChoices {...props} />), props };
}
function card(index = 0) { return within(screen.getAllByRole("article")[index]!); }
function select(index = 0) { return card(index).getByRole("button", { name: "이 시간 선택" }); }
afterEach(cleanup);

describe("card surface selection alongside participant names", () => {
  it("selects the clicked name's own card, including duplicate names, without confirming", () => {
    const { props } = setup();
    fireEvent.click(card().getByText("긴 닉네임 검토자"));
    expect(select()).toHaveAttribute("aria-pressed", "true");
    expect(select()).toHaveFocus();
    expect(select(1)).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(card(1).getByText("긴 닉네임 검토자"));
    expect(select()).toHaveAttribute("aria-pressed", "false");
    expect(select(1)).toHaveAttribute("aria-pressed", "true");
    expect(select(1)).toHaveFocus();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("keeps disclosure-button icon clicks independent, then allows the revealed name to select", () => {
    setup();
    const toggle = card().getByRole("button", { name: "나머지 3명 더보기" });
    fireEvent.click(toggle.querySelector("svg")!);
    expect(select()).toHaveAttribute("aria-pressed", "false");
    expect(card().getAllByRole("listitem")).toHaveLength(7);
    fireEvent.click(card().getByText("합성 참가자 7"));
    expect(select()).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(card().getByRole("button", { name: "접기" }));
    expect(select()).toHaveAttribute("aria-pressed", "true");
    expect(card().getAllByRole("listitem")).toHaveLength(4);
  });

  it("leaves radio input and label clicks to variant choice without selecting the card", () => {
    setup({ options: [{ ...options[0]!, variants: [{ ...variant, id: "local", meetingMode: "IN_PERSON", place: "합성 장소" }, variant] }] });
    const online = screen.getByRole("radio", { name: /온라인/ });
    fireEvent.click(online);
    expect(online).toBeChecked();
    expect(select()).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("radio", { name: /대면/ }).closest("label")!);
    expect(screen.getByRole("radio", { name: /대면/ })).toBeChecked();
    expect(select()).toHaveAttribute("aria-pressed", "false");
  });

  it("does not replace the selected card through a name while pending", () => {
    const view = setup();
    fireEvent.click(select());
    view.rerender(<RecommendationChoices {...view.props} pending />);
    fireEvent.click(card(1).getByText("긴 닉네임 검토자"));
    expect(select()).toHaveAttribute("aria-pressed", "true");
    expect(select(1)).toHaveAttribute("aria-pressed", "false");
    expect(select()).toBeDisabled();
  });

  it("keeps read-only participant names informational", () => {
    const { props } = setup({ canConfirm: false });
    fireEvent.click(card().getByText("긴 닉네임 검토자"));
    expect(screen.queryByRole("button", { name: "이 시간 선택" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "선택한 시간 확정하기" })).not.toBeInTheDocument();
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it("does not select a card with no usable variant through its surface", () => {
    setup({ options: [{ ...options[0]!, variants: [] }] });
    fireEvent.click(card().getByRole("heading"));
    expect(select()).toHaveAttribute("aria-pressed", "false");
    expect(select()).toBeDisabled();
  });
});
