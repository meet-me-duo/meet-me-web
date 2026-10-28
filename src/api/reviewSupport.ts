import type { Room } from "./types";

/** Only a literal true in the latest room response enables the optional review API. */
export function decodeReviewSupport(room: Room, latest: Room = room): Room {
  const supported = latest.review_prompt_supported === true;
  if (room.review_prompt_supported === supported) return room;
  if (room.review_prompt_supported === undefined && latest.review_prompt_supported === undefined) return room;
  return { ...room, review_prompt_supported: supported };
}
