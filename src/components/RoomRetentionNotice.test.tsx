import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { RoomRetentionNotice } from "./RoomRetentionNotice";
const expires = "2026-12-03T00:00:00Z";
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("renders the room response without an account provider or history", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
  render(<RoomRetentionNotice expiresAt={expires} />);
  expect(screen.getByText("자동 정리 D-30")).toHaveAttribute("dateTime", expires);
});
it("ignores conflicting account-list evidence and account cache clearing", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
  const client = new QueryClient();
  client.setQueryData(["account-rooms", {}], { pages: [{ rooms: [{ expires_at: "2027-01-01T00:00:00Z" }] }] });
  render(<QueryClientProvider client={client}><RoomRetentionNotice expiresAt={expires} /></QueryClientProvider>);
  expect(screen.getByText("자동 정리 D-30")).toBeInTheDocument();
  act(() => client.clear());
  expect(screen.getByText("자동 정리 D-30")).toBeInTheDocument();
});
it("uses the current room's deadline and hides missing data instead of reviving list dates", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-02T00:00:00Z"));
  const view = render(<RoomRetentionNotice expiresAt={undefined} />);
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(<RoomRetentionNotice expiresAt={expires} />);
  expect(screen.getByText("자동 정리 D-1")).toBeInTheDocument();
  view.rerender(<RoomRetentionNotice expiresAt="2026-12-04T00:00:00Z" />);
  expect(screen.getByText("자동 정리 D-2")).toBeInTheDocument();
  view.rerender(<RoomRetentionNotice expiresAt={null} />);
  expect(view.container).toBeEmptyDOMElement();
  expect(vi.getTimerCount()).toBe(0);
});
it("updates at KST midnight even when mounted between minutes", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-12-02T14:59:59.500Z"));
  render(<RoomRetentionNotice expiresAt={expires} />);
  expect(screen.getByText("자동 정리 D-1")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByText("자동 정리 D-0")).toBeInTheDocument();
});
it("updates at a subminute expiry and on visibility restoration, then removes subscriptions", () => {
  vi.useFakeTimers(); const expiry = "2026-12-03T00:00:37.250Z";
  vi.setSystemTime(new Date("2026-12-03T00:00:37.249Z"));
  const remove = vi.spyOn(document, "removeEventListener");
  const view = render(<RoomRetentionNotice expiresAt={expiry} />);
  expect(screen.getByText("자동 정리 D-0")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText("자동 정리 예정")).toBeInTheDocument();
  act(() => { vi.setSystemTime(new Date("2026-12-01T00:00:00Z")); document.dispatchEvent(new Event("visibilitychange")); });
  expect(screen.getByText("자동 정리 D-2")).toBeInTheDocument();
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  remove.mockRestore();
});
