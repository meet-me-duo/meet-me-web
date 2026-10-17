import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import GuestParticipation, { type GuestParticipationProps } from "./GuestParticipation";

afterEach(cleanup);

// #108 product decisions: display names are labels, never ownership proofs.
// This suite uses the public component contract and user-visible controls only.
const records = [
  { participantId: "participant-one", displayName: "민수" },
  { participantId: "participant-two", displayName: "민수" },
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<GuestParticipationProps> = {}) {
  const props: GuestParticipationProps = {
    roomKey: "room-one",
    identity: { kind: "guest" },
    records,
    editable: true,
    onJoin: vi.fn(async () => {}),
    onReaccess: vi.fn(async () => "VERIFIED_GUEST" as const),
    onReplace: vi.fn(async () => {}),
    onVerified: vi.fn(),
    ...overrides,
  };
  return { ...render(<GuestParticipation {...props} />), props };
}

function joinName(value = "민수") {
  fireEvent.change(screen.getByLabelText("이름", { exact: true }), { target: { value } });
}
function selectRecord(participantId = "participant-two") {
  fireEvent.change(screen.getByRole("combobox", { name: "다시 접근할 참여 기록" }), { target: { value: participantId } });
}
function reaccess(password?: string) {
  selectRecord();
  if (password !== undefined) fireEvent.change(screen.getByLabelText("기록 암호 (선택)"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "기록에 다시 접근" }));
}
async function flush() { await act(async () => { await Promise.resolve(); }); }

describe("#108 guest join and optional password", () => {
  it("requires a name but lets a guest join without an optional password", async () => {
    const { props } = setup();
    const submit = screen.getByRole("button", { name: "참여하기" });
    fireEvent.click(submit);
    expect(props.onJoin).not.toHaveBeenCalled();
    joinName("   "); fireEvent.click(submit);
    expect(props.onJoin).not.toHaveBeenCalled();
    joinName(); fireEvent.click(submit); await flush();
    expect(props.onJoin).toHaveBeenCalledExactlyOnceWith({ displayName: "민수" });
  });

  it("warns that omitting the password leaves edits unprotected and does not allow original-text lookup", () => {
    setup();
    expect(screen.getByText(/수정.*보호/)).toBeVisible();
    expect(screen.getByText(/원문.*조회/)).toBeVisible();
    expect(screen.getByLabelText("참여 암호 (선택)")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("참여 암호 (선택)")).not.toBeRequired();
    expect(screen.getByLabelText("기록 암호 (선택)")).toHaveAttribute("type", "password");
  });

  it("passes a chosen password intact and clears it after success", async () => {
    const { props } = setup(); joinName();
    fireEvent.change(screen.getByLabelText("참여 암호 (선택)"), { target: { value: " pass phrase " } });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" })); await flush();
    expect(props.onJoin).toHaveBeenCalledExactlyOnceWith({ displayName: "민수", password: " pass phrase " });
    expect(screen.getByLabelText("참여 암호 (선택)")).toHaveValue("");
  });

  it("blocks duplicate joins immediately while pending", async () => {
    const pending = deferred<void>();
    const onJoin = vi.fn(() => pending.promise);
    setup({ onJoin }); joinName();
    const submit = screen.getByRole("button", { name: "참여하기" });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    await act(async () => pending.resolve());
  });

  it("displays a safe join error, clears the password, and permits retry", async () => {
    const onJoin = vi.fn<GuestParticipationProps["onJoin"]>().mockRejectedValueOnce(new Error("secret hash internal detail")).mockResolvedValue(undefined);
    setup({ onJoin }); joinName();
    fireEvent.change(screen.getByLabelText("참여 암호 (선택)"), { target: { value: "wrong-value" } });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" })); await flush();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/secret hash|internal detail|wrong-value/);
    expect(screen.getByLabelText("참여 암호 (선택)")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "참여하기" })); await flush();
    expect(onJoin).toHaveBeenCalledTimes(2);
  });

  it("lets a member participate using the account without name or password inputs", async () => {
    const { props } = setup({ identity: { kind: "member", displayName: "회원 민수" } });
    expect(screen.queryByLabelText("이름", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/암호/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "계정으로 참여" })); await flush();
    expect(props.onJoin).toHaveBeenCalledExactlyOnceWith({});
  });

  it("never joins when collection is closed or the meeting is confirmed", () => {
    const { props } = setup({ editable: false }); joinName();
    const submit = screen.queryByRole("button", { name: "참여하기" });
    if (submit) { expect(submit).toBeDisabled(); fireEvent.click(submit); }
    expect(props.onJoin).not.toHaveBeenCalled();
  });
});

describe("#108 explicit guest reaccess without ownership by name", () => {
  it("distinguishes duplicate names by participant ID and submits the selected ID", async () => {
    const { props } = setup();
    expect(screen.getByRole("option", { name: /민수.*participant-one/ })).toHaveValue("participant-one");
    expect(screen.getByRole("option", { name: /민수.*participant-two/ })).toHaveValue("participant-two");
    expect(props.onReaccess).not.toHaveBeenCalled();
    reaccess("correct-password"); await flush();
    expect(props.onReaccess).toHaveBeenCalledExactlyOnceWith({ participantId: "participant-two", password: "correct-password" });
    expect(props.onVerified).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("기록 암호 (선택)")).toHaveValue("");
  });

  it("requires an explicit record selection before attempting reaccess", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "기록에 다시 접근" }));
    expect(props.onReaccess).not.toHaveBeenCalled();
    expect(props.onVerified).not.toHaveBeenCalled();
  });

  it("uses a generic error for wrong password without exposing response content or granting access", async () => {
    const { props } = setup({ onReaccess: vi.fn(async () => { throw new Error("password_hash=private; participant exists; retry_after=23"); }) });
    reaccess("wrong-password"); await flush();
    expect(screen.getByRole("alert")).not.toHaveTextContent(/password_hash|participant exists|retry_after|wrong-password/);
    expect(screen.getByLabelText("기록 암호 (선택)")).toHaveValue("");
    expect(props.onVerified).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("새 참여 조건")).not.toBeInTheDocument();
    expect(props.onReplace).not.toHaveBeenCalled();
  });

  it("blocks immediate duplicate reaccess attempts", async () => {
    const pending = deferred<"VERIFIED_GUEST" | "REPLACE_ONLY">();
    const onReaccess = vi.fn(() => pending.promise);
    setup({ onReaccess }); selectRecord();
    const submit = screen.getByRole("button", { name: "기록에 다시 접근" });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(onReaccess).toHaveBeenCalledTimes(1); expect(submit).toBeDisabled();
    await act(async () => pending.resolve("VERIFIED_GUEST"));
  });

  it("opens an empty explicit replacement editor without treating an unprotected record as verified", async () => {
    const { props } = setup({ onReaccess: vi.fn(async () => "REPLACE_ONLY" as const) });
    reaccess(); await flush();
    expect(props.onReaccess).toHaveBeenCalledExactlyOnceWith({ participantId: "participant-two" });
    expect(props.onVerified).not.toHaveBeenCalled();
    expect(screen.getByLabelText("새 참여 조건")).toHaveValue("");
    expect(props.onReplace).not.toHaveBeenCalled();
    const replace = screen.getByRole("button", { name: "기존 조건 대체하기" });
    fireEvent.click(replace); expect(props.onReplace).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("새 참여 조건"), { target: { value: "금요일 오후 가능" } });
    fireEvent.click(replace); await flush();
    expect(props.onReplace).toHaveBeenCalledExactlyOnceWith({ participantId: "participant-two", rawText: "금요일 오후 가능" });
    expect(props.onVerified).not.toHaveBeenCalled();
  });

  it("keeps replacement bound to the explicitly accessed record when selection changes", async () => {
    const { props } = setup({ onReaccess: vi.fn(async () => "REPLACE_ONLY" as const) });
    reaccess(); await flush();
    fireEvent.change(screen.getByLabelText("새 참여 조건"), { target: { value: "private draft" } });
    selectRecord("participant-one");
    const replace = screen.queryByRole("button", { name: "기존 조건 대체하기" });
    if (replace) fireEvent.click(replace);
    expect(props.onReplace).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue("private draft")).not.toBeInTheDocument();
  });

  it("blocks duplicate replacements while the explicit save is pending", async () => {
    const pending = deferred<void>(); const onReplace = vi.fn(() => pending.promise);
    setup({ onReaccess: vi.fn(async () => "REPLACE_ONLY" as const), onReplace });
    reaccess(); await flush();
    fireEvent.change(screen.getByLabelText("새 참여 조건"), { target: { value: "주말 가능" } });
    const replace = screen.getByRole("button", { name: "기존 조건 대체하기" });
    fireEvent.click(replace); fireEvent.click(replace);
    expect(onReplace).toHaveBeenCalledTimes(1); expect(replace).toBeDisabled();
    await act(async () => pending.resolve());
  });

  it("blocks replacement when collection closes after the editor opens", async () => {
    const view = setup({ onReaccess: vi.fn(async () => "REPLACE_ONLY" as const) });
    reaccess(); await flush();
    fireEvent.change(screen.getByLabelText("새 참여 조건"), { target: { value: "주말 가능" } });
    view.rerender(<GuestParticipation {...view.props} editable={false} />);
    const replace = screen.queryByRole("button", { name: "기존 조건 대체하기" });
    if (replace) { expect(replace).toBeDisabled(); fireEvent.click(replace); }
    expect(view.props.onReplace).not.toHaveBeenCalled();
  });
});

describe("#108 room and identity isolation for pending work", () => {
  it("discards verified reaccess resolved after switching rooms", async () => {
    const pending = deferred<"VERIFIED_GUEST" | "REPLACE_ONLY">();
    const view = setup({ onReaccess: vi.fn(() => pending.promise) });
    reaccess("private-password");
    view.rerender(<GuestParticipation {...view.props} roomKey="room-two" />);
    await act(async () => pending.resolve("VERIFIED_GUEST"));
    expect(view.props.onVerified).not.toHaveBeenCalled();
    expect(screen.getByLabelText("기록 암호 (선택)")).toHaveValue("");
  });

  it("discards an unprotected editor resolved after switching rooms", async () => {
    const pending = deferred<"VERIFIED_GUEST" | "REPLACE_ONLY">();
    const view = setup({ onReaccess: vi.fn(() => pending.promise) }); reaccess();
    view.rerender(<GuestParticipation {...view.props} roomKey="room-two" />);
    await act(async () => pending.resolve("REPLACE_ONLY"));
    expect(screen.queryByLabelText("새 참여 조건")).not.toBeInTheDocument();
    expect(view.props.onVerified).not.toHaveBeenCalled();
  });

  it("discards verified reaccess after guest identity becomes a member", async () => {
    const pending = deferred<"VERIFIED_GUEST" | "REPLACE_ONLY">();
    const view = setup({ onReaccess: vi.fn(() => pending.promise) }); reaccess("private-password");
    view.rerender(<GuestParticipation {...view.props} identity={{ kind: "member", displayName: "회원" }} />);
    await act(async () => pending.resolve("VERIFIED_GUEST"));
    expect(view.props.onVerified).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/암호/)).not.toBeInTheDocument();
  });

  it("discards a stale error and leaves a new room able to submit", async () => {
    const pending = deferred<void>();
    const onJoin = vi.fn<GuestParticipationProps["onJoin"]>().mockImplementationOnce(() => pending.promise).mockResolvedValue(undefined);
    const view = setup({ onJoin }); joinName();
    fireEvent.change(screen.getByLabelText("참여 암호 (선택)"), { target: { value: "old-private-password" } });
    fireEvent.click(screen.getByRole("button", { name: "참여하기" }));
    view.rerender(<GuestParticipation {...view.props} roomKey="room-two" />);
    expect(screen.getByLabelText("참여 암호 (선택)")).toHaveValue("");
    await act(async () => pending.reject(new Error("old-room-private-error")));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    joinName("새 이름"); fireEvent.click(screen.getByRole("button", { name: "참여하기" })); await flush();
    expect(onJoin).toHaveBeenCalledTimes(2);
    expect(onJoin).toHaveBeenLastCalledWith({ displayName: "새 이름" });
  });

  it("clears a private replacement draft when the room changes", async () => {
    const view = setup({ onReaccess: vi.fn(async () => "REPLACE_ONLY" as const) }); reaccess(); await flush();
    fireEvent.change(screen.getByLabelText("새 참여 조건"), { target: { value: "previous room private text" } });
    view.rerender(<GuestParticipation {...view.props} roomKey="room-two" />);
    expect(screen.queryByDisplayValue("previous room private text")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("새 참여 조건")).not.toBeInTheDocument();
    expect(view.props.onReplace).not.toHaveBeenCalled();
  });
});
