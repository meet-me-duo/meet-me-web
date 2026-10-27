import { useSyncExternalStore } from "react";
import { getSession, subscribeSession } from "./session";
export function useAccountSession() { return useSyncExternalStore(subscribeSession, getSession, getSession); }
