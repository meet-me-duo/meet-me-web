import { useEffect } from "react";

const DEFAULT_TITLE = "Meet me — 스마트 일정 조율";

export function useRoomTitle(purpose?: string) {
  useEffect(() => {
    document.title = purpose ? `Meet me - ${purpose}` : DEFAULT_TITLE;
    return () => { document.title = DEFAULT_TITLE; };
  }, [purpose]);
}
