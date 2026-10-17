import type { SubmissionCheckSnapshot, StartSubmissionCheckBody, SubmissionCheckCommand } from "./precheck";
import { getAccessToken, getSessionVersion } from "../auth/session";
import type {
  ApiProblem,
  CandidateList,
  ConfirmedResult,
  CreateRoomBody,
  Room,
  RecommendationList,
  RecommendationConfirmationBody,
  RecommendationAlternativeQuery,
  SaveSubmissionBody,
  SavedSubmission,
  Submission,
  UnappliedInput,
} from "./types";
import type { ReanalyzeBody, ReanalyzeResponse, ReopenBody, ReopenResponse } from "./recovery";
import type { ClarificationAnswer, ClarificationAnswerResult, ClarificationList } from "./clarifications";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: Partial<ApiProblem>,
    public readonly retryAfterSeconds?: number,
  ) {
    super(problem.detail || `요청을 처리하지 못했습니다. (${status})`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const startedEpoch = getSessionVersion();
  let token: string | null;
  try { token = getAccessToken(true); } catch (error) {
    if (error instanceof Error && error.message === "AUTH_ACCESS_EXPIRED") throw new ApiError(401, { code: "AUTH_ACCESS_EXPIRED", detail: "로그인이 만료됐어요. 페이지를 새로고침해 로그인 상태를 다시 확인해 주세요." });
    throw error;
  }
  const ensureCurrentAccount = () => { if (getSessionVersion() !== startedEpoch) throw new ApiError(409, { code: "AUTH_CONTEXT_CHANGED", detail: "로그인 계정이 바뀌었어요. 현재 계정으로 다시 확인해 주세요." }); };
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json, application/problem+json",
      "Accept-Language": "ko-KR",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  ensureCurrentAccount();
  if (!response.ok) {
    let problem: Partial<ApiProblem> = {};
    try {
      problem = (await response.json()) as Partial<ApiProblem>;
    } catch {
      problem = { detail: response.statusText };
    }
    ensureCurrentAccount();
    const headerDelay = Number(response.headers.get("Retry-After"));
    throw new ApiError(
      response.status,
      problem,
      problem.retry_after_seconds ?? (Number.isFinite(headerDelay) ? headerDelay : undefined),
    );
  }
  const body = (await response.json()) as T;
  ensureCurrentAccount();
  return body;
}

const encode = encodeURIComponent;

export const api = {
  getSubmissionCheck: (inviteCode: string, signal?: AbortSignal) => request<SubmissionCheckSnapshot>(`/api/rooms/${encode(inviteCode)}/submission/checks/current`, { signal }),
  startSubmissionCheck: (inviteCode: string, body: StartSubmissionCheckBody) => request<SubmissionCheckSnapshot>(`/api/rooms/${encode(inviteCode)}/submission/checks`, { method: "POST", body: JSON.stringify(body) }),
  answerSubmissionCheck: (inviteCode: string, checkId: string, body: SubmissionCheckCommand) => request<SubmissionCheckSnapshot>(`/api/rooms/${encode(inviteCode)}/submission/checks/${encode(checkId)}/answer`, { method: "POST", body: JSON.stringify(body) }),
  retrySubmissionCheck: (inviteCode: string, checkId: string, body: SubmissionCheckCommand) => request<SubmissionCheckSnapshot>(`/api/rooms/${encode(inviteCode)}/submission/checks/${encode(checkId)}/retry`, { method: "POST", body: JSON.stringify(body) }),
  cancelSubmissionCheck: (inviteCode: string, checkId: string, body: SubmissionCheckCommand) => request<SubmissionCheckSnapshot>(`/api/rooms/${encode(inviteCode)}/submission/checks/${encode(checkId)}/cancel`, { method: "POST", body: JSON.stringify(body) }),
  getAccountRooms: () => request<{ rooms: { invite_code: string; purpose: string; created_at: string; expires_at: string }[] }>("/api/account/rooms"),
  claimGuestRoom: (code: string) => request<Room>(`/api/rooms/${encode(code)}/claim`, { method: "POST" }),
  getClarifications: (inviteCode: string, signal?: AbortSignal) => request<ClarificationList>(`/api/rooms/${encode(inviteCode)}/submission/clarifications`, { signal }),
  answerClarification: (inviteCode: string, questionId: string, body: ClarificationAnswer) => request<ClarificationAnswerResult>(`/api/rooms/${encode(inviteCode)}/submission/clarifications/${encode(questionId)}/answer`, { method: "POST", body: JSON.stringify(body) }),
  createRoom: (body: CreateRoomBody) => request<Room>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  getRoom: (inviteCode: string, signal?: AbortSignal) => request<Room>(`/api/rooms/${encode(inviteCode)}`, { signal }),
  joinRoom: (inviteCode: string, displayName?: string, password?: string) =>
    request<Room>(`/api/rooms/${encode(inviteCode)}/participants`, { method: "POST", body: JSON.stringify(displayName === undefined ? {} : { display_name: displayName, ...(password !== undefined ? { password } : {}) }) }),
  getGuestRecords: (inviteCode: string, signal?: AbortSignal) => request<{ records: { participant_id: string; display_name: string }[] }>(`/api/rooms/${encode(inviteCode)}/guest-records`, { signal }),
  reaccessGuest: (inviteCode: string, body: { participant_id: string; password?: string }) => request<{ participant_id: string; level: "VERIFIED_GUEST" | "REPLACE_ONLY" }>(`/api/rooms/${encode(inviteCode)}/guest-records/reaccess`, { method: "POST", body: JSON.stringify(body) }),
  replaceGuestSubmission: (inviteCode: string, participantId: string, body: { raw_text: string }) => request<{ replaced: true }>(`/api/rooms/${encode(inviteCode)}/guest-records/${encode(participantId)}/submission`, { method: "PUT", body: JSON.stringify(body) }),
  getSubmission: (inviteCode: string, signal?: AbortSignal) => request<Submission>(`/api/rooms/${encode(inviteCode)}/submission`, { signal }),
  saveSubmission: (inviteCode: string, body: SaveSubmissionBody) =>
    request<SavedSubmission>(`/api/rooms/${encode(inviteCode)}/submission`, { method: "PUT", body: JSON.stringify(body) }),
  closeRoom: (inviteCode: string, confirmEarly = false) =>
    request<Room>(`/api/rooms/${encode(inviteCode)}/close`, { method: "POST", body: JSON.stringify({ confirm_early: confirmEarly }) }),
  retryAnalysis: (inviteCode: string) => request<Room>(`/api/rooms/${encode(inviteCode)}/analysis/retry`, { method: "POST" }),
  reopenRoom: (inviteCode: string, body: ReopenBody) => request<ReopenResponse>(`/api/rooms/${encode(inviteCode)}/reopen`, { method: "POST", body: JSON.stringify(body) }),
  analyzeRevision: (inviteCode: string, body: ReanalyzeBody) => request<ReanalyzeResponse>(`/api/rooms/${encode(inviteCode)}/analysis`, { method: "POST", body: JSON.stringify(body) }),
  getCandidates: (inviteCode: string) => request<CandidateList>(`/api/rooms/${encode(inviteCode)}/candidates`),
  getUnappliedInputs: (inviteCode: string) => request<UnappliedInput[]>(`/api/rooms/${encode(inviteCode)}/candidates/unapplied-inputs`),
  confirmCandidate: (inviteCode: string, candidateId: string) =>
    request<ConfirmedResult>(`/api/rooms/${encode(inviteCode)}/candidates/${encode(candidateId)}/confirmation`, { method: "POST" }),
  getResult: (inviteCode: string) => request<ConfirmedResult>(`/api/rooms/${encode(inviteCode)}/result`),
  getRecommendations: (inviteCode: string, signal?: AbortSignal) => request<RecommendationList>(`/api/rooms/${encode(inviteCode)}/recommendations`, { signal }),
  getRecommendationAlternatives: (inviteCode: string, query: RecommendationAlternativeQuery, signal?: AbortSignal): Promise<RecommendationList> => {
    const params = new URLSearchParams({ analysis_id: query.analysis_id, limit: String(query.limit ?? 20) });
    if (query.cursor !== undefined) params.set("cursor", query.cursor);
    return request<RecommendationList>(`/api/rooms/${encode(inviteCode)}/recommendations/alternatives?${params}`, { signal });
  },
  confirmRecommendation: (inviteCode: string, optionId: string, body: RecommendationConfirmationBody) => request<ConfirmedResult>(`/api/rooms/${encode(inviteCode)}/recommendations/${encode(optionId)}/confirmation`, { method: "POST", body: JSON.stringify(body) }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const fallback: Record<string, string> = {
      GUEST_SESSION_REQUIRED: "이 브라우저의 참여 정보가 없습니다.",
      GUEST_SESSION_INVALID: "참여 세션이 만료되었거나 유효하지 않습니다.",
      PARTICIPANT_REQUIRED: "이 방의 참여자만 이용할 수 있습니다.",
      HOST_PERMISSION_REQUIRED: "주최자만 실행할 수 있습니다.",
      ROOM_NOT_FOUND: "존재하지 않거나 만료된 모임입니다.",
      ROOM_CLOSED: "이미 입력이 마감된 모임입니다.",
      SUBMISSION_INPUT_REQUIRED: "가능한 시간·장소 조건을 자연어로 입력해 주세요.",
      SUBMISSION_TEXT_TOO_LONG: "조건은 앞뒤 공백을 제외하고 500자 이하로 입력해 주세요.",
      SUBMISSION_MANUAL_AVAILABILITY_UNSUPPORTED: "시간표 입력은 더 이상 지원하지 않아요. 가능한 시간을 자연어로 다시 입력해 주세요.",
      ANALYSIS_NOT_DELAYED: "현재는 재분석이 필요한 상태가 아닙니다.",
      CANDIDATES_NOT_READY: "후보를 아직 준비하고 있습니다.",
      CANDIDATE_ALREADY_CONFIRMED: "다른 후보가 이미 확정되었습니다.",
    };
    return error.problem.detail || (error.problem.code && fallback[error.problem.code]) || error.message;
  }
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
