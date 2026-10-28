import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPrompt } from "./ReviewPrompt";
import { reviewApi } from "./api";

vi.mock("./api", () => ({ reviewApi: { claim: vi.fn(), submit: vi.fn(), close: vi.fn() } }));

beforeEach(() => {
  vi.mocked(reviewApi.claim).mockResolvedValue({ prompt_id: "review-1", state: "PENDING" });
  vi.mocked(reviewApi.submit).mockResolvedValue({ prompt_id: "review-1", state: "SUBMITTED" });
  vi.mocked(reviewApi.close).mockResolvedValue({ prompt_id: "review-1", state: "CLOSED" });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks(); });

const mount = () => render(<ReviewPrompt inviteCode="confirmed-room" viewerKey="proven-viewer" />);

describe("independent confirmed review UI contract", () => {
  it("checked satisfaction submission sends only a review and never a hide command", async () => {
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    const send = screen.getByRole("button", { name: "의견 보내기" });
    expect(send).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "일주일간 보지 않기" }));
    await user.click(screen.getByRole("checkbox", { name: "불편한 점 없이 잘 이용했어요" }));
    await user.click(send);
    await waitFor(() => expect(reviewApi.submit).toHaveBeenCalledWith("confirmed-room", "review-1", expect.objectContaining({ choices: [1] })));
    expect(vi.mocked(reviewApi.submit).mock.calls[0]![2].other_text ?? null).toBeNull();
    expect(reviewApi.close).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps keyboard focus inside the modal and makes choices keyboard operable", async () => {
    const user = userEvent.setup();
    render(<button>background control</button>);
    mount();
    const dialog = await screen.findByRole("dialog");
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const complaint = within(dialog).getByRole("checkbox", { name: "응답이 느리거나 오류가 났어요" });
    complaint.focus(); await user.keyboard(" ");
    expect(complaint).toBeChecked();
    for (let i = 0; i < 18; i++) {
      await user.tab(); expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 18; i++) {
      await user.tab({ shift: true }); expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it("does not send a hidden OTHER draft after satisfaction replaces complaints", async () => {
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "synthetic private text");
    await user.click(screen.getByRole("checkbox", { name: "불편한 점 없이 잘 이용했어요" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "의견 보내기" }));
    await waitFor(() => expect(reviewApi.submit).toHaveBeenCalledWith("confirmed-room", "review-1", expect.objectContaining({ choices: [1] })));
    expect(vi.mocked(reviewApi.submit).mock.calls[0]![2].other_text ?? null).toBeNull();
    expect(JSON.stringify(vi.mocked(reviewApi.submit).mock.calls)).not.toContain("synthetic private text");
  });

  it("accepts 2000 Unicode code points and blocks 2001 without UTF16 truncation", async () => {
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    const textbox = screen.getByRole("textbox");
    const send = screen.getByRole("button", { name: "의견 보내기" });
    fireEvent.change(textbox, { target: { value: "😀".repeat(2001) } });
    expect(send).toBeDisabled();
    expect(reviewApi.submit).not.toHaveBeenCalled();
    const exact = "😀".repeat(2000);
    fireEvent.change(textbox, { target: { value: exact } });
    expect(send).toBeEnabled();
    await user.click(send);
    await waitFor(() => expect(reviewApi.submit).toHaveBeenCalledWith("confirmed-room", "review-1", { choices: [5], other_text: exact }));
  });

  it("double click and Escape during a pending close do not race another command", async () => {
    let finish!: (value: { prompt_id: string; state: "CLOSED" }) => void;
    vi.mocked(reviewApi.close).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    await user.dblClick(screen.getByRole("button", { name: "닫기" }));
    await user.keyboard("{Escape}");
    expect(reviewApi.close).toHaveBeenCalledTimes(1);
    expect(reviewApi.submit).not.toHaveBeenCalled();
    await act(async () => { finish({ prompt_id: "review-1", state: "CLOSED" }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("double submit locks choices and prevents a simultaneous close command", async () => {
    let finish!: (value: { prompt_id: string; state: "SUBMITTED" }) => void;
    vi.mocked(reviewApi.submit).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.dblClick(screen.getByRole("button", { name: "의견 보내기" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));
    await user.keyboard("{Escape}");
    expect(reviewApi.submit).toHaveBeenCalledTimes(1);
    expect(reviewApi.close).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "기타" })).toBeDisabled();
    await act(async () => { finish({ prompt_id: "review-1", state: "SUBMITTED" }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("unmount and navigation discard local drafts without transmitting them", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    const view = mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "synthetic private draft");
    view.unmount();
    expect(reviewApi.submit).not.toHaveBeenCalled();
    expect(reviewApi.close).not.toHaveBeenCalled();
    expect(storage).not.toHaveBeenCalled();
    vi.mocked(reviewApi.claim).mockResolvedValueOnce({ prompt_id: null, state: "SUPPRESSED" });
    mount();
    await waitFor(() => expect(reviewApi.claim).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("synthetic private draft")).not.toBeInTheDocument();
  });

  it("a late claim after unmount cannot render or send a review", async () => {
    let finish!: (value: { prompt_id: string; state: "PENDING" }) => void;
    vi.mocked(reviewApi.claim).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = mount();
    view.unmount();
    await act(async () => { finish({ prompt_id: "old-private-prompt", state: "PENDING" }); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reviewApi.submit).not.toHaveBeenCalled();
    expect(reviewApi.close).not.toHaveBeenCalled();
  });

  it("a persisted pageshow discards the old draft and claims with a new request", async () => {
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "synthetic restored-page draft");
    fireEvent(window, new Event("pageshow"));
    expect(reviewApi.claim).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox")).toHaveValue("synthetic restored-page draft");
    vi.mocked(reviewApi.claim).mockResolvedValueOnce({ prompt_id: null, state: "SUPPRESSED" });
    const restored = new Event("pageshow");
    Object.defineProperty(restored, "persisted", { value: true });
    fireEvent(window, restored);
    await waitFor(() => expect(reviewApi.claim).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reviewApi.claim).mock.calls[0]![1]).not.toBe(vi.mocked(reviewApi.claim).mock.calls[1]![1]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("synthetic restored-page draft")).not.toBeInTheDocument();
    expect(reviewApi.submit).not.toHaveBeenCalled();
    expect(reviewApi.close).not.toHaveBeenCalled();
  });

  it("a late submit cannot close another viewer's prompt or restore the previous draft", async () => {
    let finish!: (value: { prompt_id: string; state: "SUBMITTED" }) => void;
    vi.mocked(reviewApi.submit).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup();
    const view = mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "synthetic old-viewer draft");
    await user.click(screen.getByRole("button", { name: "의견 보내기" }));
    vi.mocked(reviewApi.claim).mockResolvedValueOnce({ prompt_id: "new-viewer-prompt", state: "PENDING" });
    view.rerender(<ReviewPrompt inviteCode="confirmed-room" viewerKey="another-proven-viewer" />);
    await screen.findByRole("dialog");
    await act(async () => { finish({ prompt_id: "review-1", state: "SUBMITTED" }); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("synthetic old-viewer draft")).not.toBeInTheDocument();
    expect(screen.queryByText("의견이 접수됐어요. 감사합니다.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(reviewApi.close).toHaveBeenCalledWith("confirmed-room", "new-viewer-prompt", false));
  });

  it("checked-close failure retries only the same hide command and never sends the draft", async () => {
    vi.mocked(reviewApi.close).mockRejectedValueOnce(new Error("synthetic backend detail"));
    const user = userEvent.setup();
    mount(); await screen.findByRole("dialog");
    await user.click(screen.getByRole("checkbox", { name: "기타" }));
    await user.type(screen.getByRole("textbox"), "synthetic unsent close draft");
    await user.click(screen.getByRole("checkbox", { name: "일주일간 보지 않기" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));
    await user.click(await screen.findByRole("button", { name: "숨김 다시 저장" }));
    await waitFor(() => expect(reviewApi.close).toHaveBeenCalledTimes(2));
    expect(vi.mocked(reviewApi.close).mock.calls).toEqual([
      ["confirmed-room", "review-1", true], ["confirmed-room", "review-1", true],
    ]);
    expect(reviewApi.submit).not.toHaveBeenCalled();
    expect(screen.queryByText("synthetic backend detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
