import type { components } from "./schema";
import type { Complete, Room, RevisionRound } from "./types";
import { decodeReviewSupport } from "./reviewSupport";

export type { RevisionRound } from "./types";
export type RecoveryRoom = Room;
export type ReopenBody = Complete<components["schemas"]["ReopenInputRequest"]>;
export type ReanalyzeBody = Complete<components["schemas"]["AnalyzeRevisionRequest"]>;
export type ReopenResponse = Omit<Complete<components["schemas"]["ReopenedInputResponse"]>, "room" | "round"> & { room: Room; round: RevisionRound };
export type ReanalyzeResponse = Omit<Complete<components["schemas"]["RevisionAnalysisResponse"]>, "room"> & { room: Room };

export function currentRoom(previous: RecoveryRoom | undefined, incoming: RecoveryRoom): RecoveryRoom {
  const current = !incoming.viewer.joined || (previous && viewerContext(previous) !== viewerContext(incoming))
    ? incoming
    : previous && incoming.state_version !== undefined && previous.state_version !== undefined && incoming.state_version < previous.state_version ? previous : incoming;
  return decodeReviewSupport(current, incoming);
}
export function viewerContext(room: Room): string { return JSON.stringify([room.viewer.joined, room.viewer.role, room.viewer.display_name, room.viewer.context_id ?? null]); }
export function correctionOpen(room: RecoveryRoom): boolean {
  return room.collection_status === "CLOSED" && room.revision_round?.status === "OPEN";
}
