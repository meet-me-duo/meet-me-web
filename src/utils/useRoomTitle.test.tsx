import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useRoomTitle } from "./useRoomTitle";

function Title({ purpose }: { purpose?: string }) { useRoomTitle(purpose); return null; }

afterEach(() => { cleanup(); document.title = ""; });

describe("room page title", () => {
  it("shows the public meeting name as plain text", () => {
    render(<Title purpose={'가족 <모임> & "친구"'} />);
    expect(document.title).toBe('Meet me - 가족 <모임> & "친구"');
    expect(document.querySelector("title 모임")).toBeNull();
  });

  it("clears an old room while loading another room and restores the exact homepage title on exit", () => {
    const view = render(<Title purpose="가족 모임" />);
    expect(document.title).toBe("Meet me - 가족 모임");
    view.rerender(<Title />);
    expect(document.title).toBe("Meet me — 스마트 일정 조율");
    view.rerender(<Title purpose="친구 모임" />);
    expect(document.title).toBe("Meet me - 친구 모임");
    view.unmount();
    expect(document.title).toBe("Meet me — 스마트 일정 조율");
  });
});
