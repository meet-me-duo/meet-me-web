import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import GuestParticipation from "./GuestParticipation";

afterEach(cleanup);
it("EX-PRIVACY tells a blind V2 replacement writer about host disclosure before saving", async () => {
  const replace = vi.fn().mockResolvedValue(undefined);
  render(<GuestParticipation roomKey="synthetic-v2-room" submissionProtocol="PRE_SUBMIT_V2" identity={{ kind: "guest" }} records={[{ participantId: "synthetic-participant", displayName: "합성 참여자" }]} editable onJoin={vi.fn()} onReaccess={vi.fn().mockResolvedValue("REPLACE_ONLY")} onReplace={replace} onVerified={vi.fn()} />);
  fireEvent.change(screen.getByRole("combobox", { name: "다시 접근할 참여 기록" }), { target: { value: "synthetic-participant" } });
  fireEvent.click(screen.getByRole("button", { name: "기록에 다시 접근" }));
  await screen.findByRole("textbox", { name: "새 참여 조건" });
  expect(screen.getByText(/해석되지 않은 경우 원문과 미반영 사유를 주최자/)).toBeInTheDocument();
  expect(replace).not.toHaveBeenCalled();
});
