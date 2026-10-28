import { useSyncExternalStore, type MouseEvent } from "react";

type Provider = "google" | "kakao";
type NavigationState = { pending: Provider | null; error: string };
const idle: NavigationState = { pending: null, error: "" };
let state = idle;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function update(next: NavigationState) {
  state = next;
  listeners.forEach(listener => listener());
}
function reset() { clearTimeout(timer); update(idle); }
function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("pageshow", reset);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("pageshow", reset);
      clearTimeout(timer);
      state = idle;
    }
  };
}

// Ephemeral document-wide state: recovery and login cards can coexist in this SPA.
// No auth data or storage; last unmount and BFCache pageshow both reset the lock.
export function useSocialLoginNavigation() {
  const current = useSyncExternalStore(subscribe, () => state, () => idle);
  return { ...current, start };
}

function start(event: MouseEvent<HTMLAnchorElement>, provider: Provider, onBeforeNavigate: () => void) {
  if (event.defaultPrevented) return;
  if (state.pending) { event.preventDefault(); return; }
  try { onBeforeNavigate(); } catch {
    event.preventDefault();
    update({ pending: null, error: "로그인을 시작하지 못했어요. 다시 시도해 주세요." });
    return;
  }
  // Preserve native modified-click/new-tab behavior without locking the source tab.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  update({ pending: provider, error: "" });
  // A blocked/cancelled navigation or HTTP 204 can leave this document visible.
  // Allow explicit retry after a delay; never issue a request automatically.
  timer = setTimeout(() => update({
    pending: null,
    error: "로그인 화면으로 이동이 지연되고 있어요. 연결 상태를 확인하고 다시 시도해 주세요.",
  }), 15_000);
}
