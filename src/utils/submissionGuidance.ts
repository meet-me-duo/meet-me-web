import type { Room } from "../api/types";

export const TIME_INPUT_GUIDE = "시간은 오전·오후를 함께 적어 주세요. 19~20시처럼 적어도 좋아요.";

export function submissionExample(mode: Room["meeting_mode"]): string {
  return mode === "REMOTE"
    ? "예: 내일 오후 7~8시, 비대면으로 가능해요."
    : "예: 내일 오후 7~8시, 강남 근처가 좋아요.";
}
