import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { RoomRetentionNotice } from "./RoomRetentionNotice";
const code = "a".repeat(22);
const page = (expires = "2026-12-03T00:00:00Z") => ({ pages: [{ rooms: [{ invite_code: code, created_at: "2026-11-03T00:00:00Z", expires_at: expires }] }] });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("uses only matching list evidence, updates cache and clears at an account boundary", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-02T14:00:00Z"));
  const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}><RoomRetentionNotice inviteCode={code} /></QueryClientProvider>);
  expect(view.container).toBeEmptyDOMElement();
  act(() => { client.setQueryData(["account-rooms", {}], page()); });
  expect(screen.getByText("자동 정리까지 D-1")).toBeInTheDocument();
  act(() => { vi.setSystemTime(new Date("2026-12-02T15:00:00Z")); vi.advanceTimersByTime(60_000); });
  expect(screen.getByText("자동 정리까지 D-0")).toBeInTheDocument();
  act(() => { client.clear(); }); expect(view.container).toBeEmptyDOMElement();
});
it("does not render conflicting or other-room information", () => {
  const client = new QueryClient();client.setQueryData(["account-rooms", {}], page());client.setQueryData(["account-rooms", {role:"HOST"}], {pages:[{rooms:[{invite_code:code,created_at:"2026-11-04T00:00:00Z",expires_at:"2026-12-04T00:00:00Z"}]}]});
  const view = render(<QueryClientProvider client={client}><RoomRetentionNotice inviteCode={code} /></QueryClientProvider>);expect(view.container).toBeEmptyDOMElement();
  view.rerender(<QueryClientProvider client={client}><RoomRetentionNotice inviteCode={"b".repeat(22)} /></QueryClientProvider>);expect(view.container).toBeEmptyDOMElement();
});
