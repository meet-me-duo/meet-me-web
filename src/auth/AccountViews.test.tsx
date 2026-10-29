import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { AccountArchive, LoginGate } from "./AccountViews";
import { api, ApiError } from "../api/client";

function mount(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter>{node}</MemoryRouter></QueryClientProvider>); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("account entry and archive without guest claim UI", () => {
  it("offers a concise login entry with both providers and no name field", () => {
    mount(<LoginGate returnTo="/create" />);
    expect(screen.getByRole("link", { name: "Google로 로그인" })).toHaveAttribute("href", expect.stringMatching(/\/api\/auth\/google\/start$/));
    expect(screen.getByRole("link", { name: "Kakao로 로그인" })).toHaveAttribute("href", expect.stringMatching(/\/api\/auth\/kakao\/start$/));
    expect(screen.getByRole("heading", { name: /^로그인$/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("offers no guest-account connection entry and never claims automatically", () => {
    const claim = vi.spyOn(api, "claimGuestRoom"); mount(<LoginGate />);
    expect(claim).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /참여.*연결/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/이 브라우저.*참여.*연결/)).not.toBeInTheDocument();
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
