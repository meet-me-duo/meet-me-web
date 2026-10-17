import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GuestParticipation from "./GuestParticipation";

// Approved follow-up to PS18/PD06: a blind replacement in PRE_SUBMIT_V1 saves a
// candidate/check, does not upgrade READ_OWN, and cannot promise CLEAR/result use.
const participantId = "11111111-1111-4111-8111-111111111111";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("#107 blind replacement protocol wording", () => {
  it.each(["PRE_SUBMIT_V1", "LEGACY"] as const)("keeps %s replacement blind and distinguishes durable save from verified completion", async submissionProtocol => {
    const onReplace = vi.fn().mockResolvedValue(undefined); const onVerified = vi.fn();
    render(<GuestParticipation roomKey="independent-blind:epoch1" submissionProtocol={submissionProtocol} identity={{ kind: "guest" }} records={[{ participantId, displayName: "본인" }]} editable showJoin={false} onJoin={vi.fn()} onReaccess={vi.fn().mockResolvedValue("REPLACE_ONLY")} onReplace={onReplace} onVerified={onVerified} />);
    fireEvent.change(screen.getByRole("combobox", { name: "다시 접근할 참여 기록" }), { target: { value: participantId } });
    fireEvent.click(screen.getByRole("button", { name: "기록에 다시 접근" }));
    const input = await screen.findByRole("textbox", { name: "새 참여 조건" }); expect(input).toHaveValue("");
    fireEvent.change(input, { target: { value: "  새로 대체할 주말 조건  " } }); fireEvent.click(screen.getByRole("button", { name: "기존 조건 대체하기" }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledExactlyOnceWith({ participantId, rawText: "새로 대체할 주말 조건" }));
    await screen.findByRole("status"); expect(onVerified).not.toHaveBeenCalled();
    expect(document.body).toHaveTextContent(/기존 원문 조회 권한.*부여되지/);
    if (submissionProtocol === "PRE_SUBMIT_V1") {
      expect(document.body).toHaveTextContent(/원문.*저장|조건.*저장/);
      expect(document.body).toHaveTextContent(/확인.*반영|확인.*완료/);
      expect(document.body).not.toHaveTextContent(/제출 완료|조건 제출을 완료|이번 결과에 반영했/);
    } else {
      expect(document.body).toHaveTextContent("새 조건으로 대체했어요.");
    }
  });
});
