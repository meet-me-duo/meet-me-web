import type { MouseEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialLoginLink } from "./SocialLoginLink";

afterEach(() => cleanup());

describe("SocialLoginLink", () => {
  it("keeps the OAuth link and calls the existing return handler once", () => {
    const onClick = vi.fn((event: MouseEvent<HTMLAnchorElement>) => event.preventDefault());
    render(<SocialLoginLink provider="google" label="Google로 로그인" href="/api/auth/google/start" onClick={onClick} />);
    const link = screen.getByRole("link", { name: "Google로 로그인" });
    expect(link).toHaveAttribute("href", "/api/auth/google/start");
    expect(link.querySelector("button")).toBeNull();
    expect(link.querySelector("img")).toHaveAttribute("src", "/brands/google-g.svg");
    expect(link.querySelector("img")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("maps aria-disabled to non-navigation and suppresses the return handler", () => {
    const onClick = vi.fn();
    render(<SocialLoginLink provider="google" label="Google로 로그인" href="/api/auth/google/start" aria-disabled="true" onClick={onClick} />);
    const link = screen.getByRole("link", { name: "Google로 로그인" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("tabindex", "-1");
    expect(fireEvent.click(link)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the complete Kakao asset and extended recovery label", () => {
    render(<SocialLoginLink provider="kakao" label="같은 계정으로 Kakao 로그인" href="/api/auth/kakao/start" />);
    const link = screen.getByRole("link", { name: "같은 계정으로 Kakao 로그인" });
    expect(link).toHaveAttribute("href", "/api/auth/kakao/start");
    expect(link.querySelector("img")).toHaveAttribute("src", "/brands/kakao-login.svg");
    expect(link.querySelector("img")).toHaveAttribute("width", "224");
    expect(link.querySelector("img")).toHaveAttribute("height", "46");
  });
});
