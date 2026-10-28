import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocialLoginActions } from "./SocialLoginActions";

const cancelledByApp = new WeakMap<Event, boolean>();
// React handles the event at the root first. Record its decision, then prevent
// jsdom from attempting native document navigation (covered in browser tests).
function preventJsdomNavigation(event: Event) { cancelledByApp.set(event, event.defaultPrevented); event.preventDefault(); }
beforeEach(() => document.addEventListener("click", preventJsdomNavigation));
afterEach(() => { cleanup(); document.removeEventListener("click", preventJsdomNavigation); vi.useRealTimers(); });
function click(link: HTMLElement, init: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
  act(() => { link.dispatchEvent(event); });
  return !cancelledByApp.get(event);
}

describe("shared native OAuth feedback", () => {
  for (const provider of ["Google", "Kakao"]) {
    it(`${provider} locks both providers immediately and restores after pageshow`, () => {
      vi.useFakeTimers();
      const remember = vi.fn();
      render(<SocialLoginActions apiBase="" onBeforeNavigate={remember} />);
      const chosen = screen.getByRole("link", { name: `${provider}로 로그인` });
      // Inspect native default cancellation without letting jsdom attempt navigation.
      const first = new MouseEvent("click", { bubbles: true, cancelable: true });
      const second = new MouseEvent("click", { bubbles: true, cancelable: true });
      act(() => { chosen.dispatchEvent(first); chosen.dispatchEvent(second); });
      expect(cancelledByApp.get(first)).toBe(false);
      expect(cancelledByApp.get(second)).toBe(true);
      expect(remember).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("status")).toHaveTextContent(`${provider} 로그인 화면으로 이동 중…`);
      expect(chosen).toHaveAttribute("aria-busy", "true");
      for (const link of screen.getAllByRole("link")) {
        expect(link).toHaveAttribute("aria-disabled", "true");
        expect(link).toHaveAttribute("href");
        expect(link).toHaveAttribute("tabindex", "-1");
        expect(click(link)).toBe(false);
      }
      act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-disabled");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      act(() => vi.advanceTimersByTime(15_000));
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  }

  it("releases delayed navigation for explicit retry without automatic requests", () => {
    vi.useFakeTimers();
    const remember = vi.fn();
    render(<SocialLoginActions apiBase="https://api.example.test" onBeforeNavigate={remember} />);
    fireEvent.click(screen.getByRole("link", { name: "Kakao로 로그인" }));
    act(() => vi.advanceTimersByTime(15_000));
    expect(screen.getByRole("alert")).toHaveTextContent("이동이 지연되고 있어요");
    expect(remember).toHaveBeenCalledTimes(1);
    const google = screen.getByRole("link", { name: "Google로 로그인" });
    expect(google).toHaveAttribute("href", "https://api.example.test/api/auth/google/start");
    expect(google).not.toHaveAttribute("aria-disabled");
    fireEvent.click(google);
    expect(remember).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Google 로그인 화면으로 이동 중…");
  });

  it("cancels navigation on preparation error, hides raw error and allows retry", () => {
    const remember = vi.fn().mockImplementationOnce(() => { throw new Error("private error"); });
    render(<SocialLoginActions apiBase="" onBeforeNavigate={remember} recovery />);
    const link = screen.getByRole("link", { name: "같은 계정으로 Kakao 로그인" });
    expect(click(link)).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("로그인을 시작하지 못했어요");
    expect(screen.queryByText("private error")).not.toBeInTheDocument();
    expect(link).not.toHaveAttribute("aria-disabled");
    fireEvent.click(link);
    expect(screen.getByRole("status")).toHaveTextContent("Kakao 로그인 화면으로 이동 중…");
  });

  it.each(["ctrlKey", "metaKey", "shiftKey", "altKey"])("keeps native %s behavior without locking the source tab", modifier => {
    const remember = vi.fn();
    render(<SocialLoginActions apiBase="" onBeforeNavigate={remember} />);
    expect(click(screen.getByRole("link", { name: "Google로 로그인" }), { [modifier]: true })).toBe(true);
    expect(remember).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-disabled");
  });

  it("clears the pending timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = render(<SocialLoginActions apiBase="" onBeforeNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("link", { name: "Google로 로그인" }));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("locks separate recovery and login groups together before React rerenders", () => {
    const remember = vi.fn();
    render(<><SocialLoginActions apiBase="" onBeforeNavigate={remember} recovery />
      <SocialLoginActions apiBase="" onBeforeNavigate={remember} /></>);
    act(() => {
      fireEvent.click(screen.getByRole("link", { name: "같은 계정으로 Google 로그인" }));
      expect(click(screen.getByRole("link", { name: "Kakao로 로그인" }))).toBe(false);
    });
    expect(remember).toHaveBeenCalledTimes(1);
    for (const link of screen.getAllByRole("link")) expect(link).toHaveAttribute("aria-disabled", "true");
  });
});
