import { z } from "zod";
import type { CreateRoomBody } from "../api/types";
import { localSeoulToIso } from "./time";

const DAY = 86_400_000;

function dateEpoch(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : NaN;
}

export function exclusiveSearchEnd(lastDate: string): string {
  return new Date(dateEpoch(lastDate) + DAY).toISOString().slice(0, 10);
}

export function defaultSearchDates(now = new Date()): { start: string; last: string } {
  // The API defaults from the creation date in Asia/Seoul, independent of the browser zone.
  const start = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  return { start, last: new Date(dateEpoch(start) + 13 * DAY).toISOString().slice(0, 10) };
}

export const createRoomSchema = z.object({
  hostName: z.string().trim().min(1, "이름을 입력해 주세요.").max(50, "50자 이하로 입력해 주세요."),
  purpose: z.string().trim().min(1, "모임 목적을 입력해 주세요.").max(500, "500자 이하로 입력해 주세요."),
  meetingMode: z.enum(["EITHER", "IN_PERSON", "REMOTE"]),
  customSearch: z.boolean(),
  searchStart: z.string(),
  searchEnd: z.string(),
  useExpected: z.boolean(),
  expectedParticipants: z.string(),
  useDeadline: z.boolean(),
  deadline: z.string(),
  manualOnly: z.boolean(),
}).superRefine((value, context) => {
  if (value.customSearch) {
    const start = dateEpoch(value.searchStart), last = dateEpoch(value.searchEnd);
    if (!Number.isFinite(start) || !Number.isFinite(last)) {
      context.addIssue({ code: "custom", path: ["searchEnd"], message: "시작일과 마지막 날을 올바른 날짜로 선택해 주세요." });
    } else if ((last - start) / DAY + 1 < 1 || (last - start) / DAY + 1 > 31) {
      context.addIssue({ code: "custom", path: ["searchEnd"], message: "마지막 날을 포함해 1일 이상 31일 이하로 선택해 주세요." });
    }
  }
  if (value.manualOnly) return;
  if (!value.useExpected && !value.useDeadline) context.addIssue({ code: "custom", path: ["manualOnly"], message: "자동 마감 조건을 하나 이상 선택해 주세요." });
  const count = Number(value.expectedParticipants);
  if (value.useExpected && (!Number.isInteger(count) || count < 2 || count > 50)) context.addIssue({ code: "custom", path: ["expectedParticipants"], message: "2명 이상 50명 이하의 정수로 입력해 주세요." });
  if (value.useDeadline) {
    const deadline = new Date(`${value.deadline}:00+09:00`).getTime();
    if (!Number.isFinite(deadline)) context.addIssue({ code: "custom", path: ["deadline"], message: "마감 시각을 선택해 주세요." });
    else if (deadline <= Date.now()) context.addIssue({ code: "custom", path: ["deadline"], message: "현재보다 뒤의 시간을 선택해 주세요." });
  }
});

export type CreateRoomValues = z.infer<typeof createRoomSchema>;

export function createRoomBody(value: CreateRoomValues): CreateRoomBody {
  return {
    host_display_name: value.hostName.trim(), purpose: value.purpose.trim(), meeting_mode: value.meetingMode,
    expected_participants: !value.manualOnly && value.useExpected ? Number(value.expectedParticipants) : null,
    submission_deadline: !value.manualOnly && value.useDeadline ? localSeoulToIso(value.deadline) : null,
    manual_only: value.manualOnly,
    search_start_date: value.customSearch ? value.searchStart : null,
    search_end_date: value.customSearch ? exclusiveSearchEnd(value.searchEnd) : null,
  };
}
