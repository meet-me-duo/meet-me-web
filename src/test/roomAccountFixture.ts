import { vi } from "vitest";
import type { Room } from "../api/types";
import * as accountHook from "../auth/useAccount";

/** Only the selected HOST fixture is logged in; guest/member fixtures stay anonymous. */
export function mockRoomAccount(room: Pick<Room, "viewer">) {
  const session = room.viewer.role === "HOST" ? {
    accessToken: "synthetic-host-access",
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    account: { id: "11111111-2222-4333-8444-555555555555", displayName: room.viewer.display_name ?? "합성 주최자" },
  } : null;
  vi.spyOn(accountHook, "useAccountSession").mockReturnValue(session);
}
