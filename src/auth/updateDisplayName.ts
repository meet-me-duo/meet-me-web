import { request } from "../api/client";
import type { components } from "../api/schema";
import type { Complete } from "../api/types";
import { completeAccountProfileUpdate, getSession, getSessionVersion } from "./session";

type UpdateDisplayNameBody = Complete<components["schemas"]["UpdateAccountDisplayNameRequest"]>;

export async function updateDisplayName(displayName: string) {
  const current = getSession(), version = getSessionVersion();
  if (!current) throw new Error("Account required");
  const body: UpdateDisplayNameBody = { displayName };
  const value = await request<unknown>("/api/auth/me", { method: "PUT", body: JSON.stringify(body) });
  if (!value || typeof value !== "object") throw new Error("Invalid account response");
  const account = value as components["schemas"]["AccountResponse"];
  if (account.id !== current.account.id || typeof account.displayName !== "string" || !account.displayName.trim()
    || !account.capabilities || typeof account.capabilities.canViewOperations !== "boolean") throw new Error("Invalid account response");
  return completeAccountProfileUpdate({ id: account.id, displayName: account.displayName, capabilities: { canViewOperations: account.capabilities.canViewOperations } }, version);
}
