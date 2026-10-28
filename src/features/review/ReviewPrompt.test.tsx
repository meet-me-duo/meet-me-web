import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPrompt } from "./ReviewPrompt";
import { reviewApi } from "./api";

vi.mock("./api", () => ({ reviewApi: { claim: vi.fn(), submit: vi.fn(), close: vi.fn() } }));
beforeEach(() => {
  vi.mocked(reviewApi.claim).mockResolvedValue({ prompt_id: "prompt", state: "PENDING" });
  vi.mocked(reviewApi.submit).mockResolvedValue({ prompt_id: "prompt", state: "SUBMITTED" });
  vi.mocked(reviewApi.close).mockResolvedValue({ prompt_id: "prompt", state: "CLOSED" });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const mount = () => render(<ReviewPrompt inviteCode="room" viewerKey="viewer" />);
async function open() { mount(); return screen.findByRole("dialog"); }

describe("confirmed review policy and UI", () => {
  it("only requests after confirmed-result integration enables it and StrictMode claims once", async () => {
    const view = render(<ReviewPrompt inviteCode="room" viewerKey="viewer" enabled={false} />);
    expect(reviewApi.claim).not.toHaveBeenCalled();
    view.rerender(<StrictMode><ReviewPrompt inviteCode="room" viewerKey="viewer" /></StrictMode>);
    await screen.findByRole("dialog");
    expect(reviewApi.claim).toHaveBeenCalledTimes(1);
  });
  it("offers exactly the agreed choices, with satisfaction exclusive", async () => {
    const user = userEvent.setup(); await open();
    const happy = screen.getByRole("checkbox", { name: "불편한 점 없이 잘 이용했어요" });
    const ai = screen.getByRole("checkbox", { name: "AI가 제가 입력한 조건을 잘못 이해했어요" });
    const time = screen.getByRole("checkbox", { name: "추천된 시간 중 마음에 드는 선택지가 없었어요" });
    await user.click(ai); await user.click(time);
    expect(ai).toBeChecked(); expect(time).toBeChecked();
    await user.click(happy); expect(ai).not.toBeChecked(); expect(time).not.toBeChecked();
    await user.click(ai); expect(happy).not.toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
  });
  it("allows OTHER with optional blank text and multiple complaints", async () => {
    const user = userEvent.setup(); await open();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    expect(screen.getByRole("textbox", { name: /더 들려주고/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "의견 보내기" }));
    await waitFor(() => expect(reviewApi.submit).toHaveBeenCalledWith("room", "prompt", { choices: [5], other_text: null }));
    expect(reviewApi.close).not.toHaveBeenCalled();
  });
  it("never transmits drafts on checked close and never reopens on rerender", async () => {
    const user = userEvent.setup(); const view = mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "private@example.com 원문");
    await user.click(screen.getByRole("checkbox", { name: "일주일간 보지 않기" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(reviewApi.close).toHaveBeenCalledWith("room", "prompt", true));
    expect(reviewApi.submit).not.toHaveBeenCalled();
    view.rerender(<ReviewPrompt inviteCode="room" viewerKey="viewer" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reviewApi.claim).toHaveBeenCalledTimes(1);
  });
  it("Escape closes unsubmitted and restores focus", async () => {
    const user = userEvent.setup(); render(<button>결과 확인</button>);
    const trigger = screen.getByRole("button", { name: "결과 확인" }); trigger.focus(); await open();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(reviewApi.close).toHaveBeenCalledWith("room", "prompt", false));
    expect(trigger).toHaveFocus();
  });
  it("keeps a failed submit payload stable for retry and keeps draft off Web Storage", async () => {
    const user = userEvent.setup(); const local = vi.spyOn(Storage.prototype, "setItem");
    vi.mocked(reviewApi.submit).mockRejectedValueOnce(new Error("lost response"));
    await open(); await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "private draft");
    await user.click(screen.getByRole("button", { name: "의견 보내기" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "다시 제출" }));
    await waitFor(() => expect(reviewApi.submit).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reviewApi.submit).mock.calls[0]).toEqual(vi.mocked(reviewApi.submit).mock.calls[1]);
    expect(local).not.toHaveBeenCalled(); local.mockRestore();
  });
  it("isolates draft and pending response when room/viewer changes", async () => {
    let resolve!: (value: { prompt_id: string; state: "PENDING" }) => void;
    vi.mocked(reviewApi.claim).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const view = mount();
    view.rerender(<ReviewPrompt inviteCode="another" viewerKey="other" />);
    await screen.findByRole("dialog");
    resolve({ prompt_id: "old-private-prompt", state: "PENDING" });
    await waitFor(() => expect(reviewApi.claim).toHaveBeenCalledTimes(2));
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(reviewApi.close).toHaveBeenCalledWith("another", "prompt", false));
  });
});
