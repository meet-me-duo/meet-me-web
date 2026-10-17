import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AccountArchive, ClaimGuestParticipation, LoginGate } from "./AccountViews";
import { api, ApiError } from "../api/client";

function mount(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("#109 account entry and explicit claim", () => {
  it("offers both providers and explains guest participation without asking for a name", () => {
    mount(<LoginGate returnTo="/create" />);
    expect(screen.getByRole("link", { name: "Google로 로그인" })).toHaveAttribute("href", expect.stringMatching(/\/api\/auth\/google\/start$/));
    expect(screen.getByRole("link", { name: "Kakao로 로그인" })).toHaveAttribute("href", expect.stringMatching(/\/api\/auth\/kakao\/start$/));
    expect(screen.getByText(/참여자는 로그인 없이/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("never claims automatically and preserves conflict without invoking success", async () => {
    const claim = vi.spyOn(api, "claimGuestRoom").mockRejectedValue(new ApiError(409, { code: "PARTICIPANT_CONFLICT", detail: "이미 계정 참여가 있어요." }));
    const success = vi.fn(); mount(<ClaimGuestParticipation inviteCode="abcdefghijklmnopqrstuv" onClaimed={success} />);
    expect(claim).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이 브라우저의 기존 참여 연결" }));
    await screen.findByText("이미 계정 참여가 있어요.");
    expect(claim).toHaveBeenCalledTimes(1); expect(success).not.toHaveBeenCalled();
    expect(screen.queryByText(/병합 완료/)).not.toBeInTheDocument();
  });
  it("renders account archive separately with expiry and links only returned records", async () => {
    vi.spyOn(api, "getAccountRooms").mockResolvedValue({ rooms: [{ invite_code: "abcdefghijklmnopqrstuv", purpose: "내 방", created_at: "2026-10-17T00:00:00Z", expires_at: "2026-11-16T00:00:00Z" }] });
    mount(<AccountArchive />);
    expect(await screen.findByRole("heading", { name: "내가 만든 모임" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /내 방/ })).toHaveAttribute("href", "/rooms/abcdefghijklmnopqrstuv");
    expect(screen.getByText(/정리 예정/)).toBeInTheDocument();
    expect(screen.getByText(/30일/)).toBeInTheDocument();
  });
  it("does not show cached archive after authorization denial", async () => {
    vi.spyOn(api, "getAccountRooms").mockRejectedValue(new ApiError(401, { code: "AUTH_REQUIRED" }));
    mount(<AccountArchive />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "내 방" })).not.toBeInTheDocument();
  });
});
