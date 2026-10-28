import { request } from "../../api/client";

export type ReviewState = "PENDING" | "SUBMITTED" | "CLOSED" | "SUPPRESSED";
export interface ReviewReceipt { prompt_id: string | null; state: ReviewState }
export interface ReviewAnswer { choices: number[]; other_text?: string | null }
const path = (code: string) => `/api/rooms/${encodeURIComponent(code)}/review-prompt`;

export const reviewApi = {
  claim: (code: string, requestId: string) => request<ReviewReceipt>(path(code), { method: "POST", body: JSON.stringify({ request_id: requestId }) }),
  submit: (code: string, promptId: string, answer: ReviewAnswer) => request<ReviewReceipt>(`${path(code)}/${encodeURIComponent(promptId)}/submission`, { method: "POST", body: JSON.stringify(answer) }),
  close: (code: string, promptId: string, hideForWeek: boolean) => request<ReviewReceipt>(`${path(code)}/${encodeURIComponent(promptId)}/close`, { method: "POST", body: JSON.stringify({ hide_for_week: hideForWeek }) }),
};
