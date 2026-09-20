import type {
  ApiProblem,
  CandidateList,
  ConfirmedResult,
  CreateRoomBody,
  Room,
  SaveSubmissionBody,
  Submission,
  UnappliedInput,
} from "./types";

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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json, application/problem+json",
      "Accept-Language": "ko-KR",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let problem: Partial<ApiProblem> = {};
    try {
      problem = (await response.json()) as Partial<ApiProblem>;
    } catch {
      problem = { detail: response.statusText };
    }
    const headerDelay = Number(response.headers.get("Retry-After"));
    throw new ApiError(
      response.status,
      problem,
      problem.retry_after_seconds ?? (Number.isFinite(headerDelay) ? headerDelay : undefined),
    );
  }
  return (await response.json()) as T;
}

const encode = encodeURIComponent;

export const api = {
  createRoom: (body: CreateRoomBody) => request<Room>("/api/rooms", { method: "POST", body: JSON.stringify(body) }),
  getRoom: (inviteCode: string, signal?: AbortSignal) => request<Room>(`/api/rooms/${encode(inviteCode)}`, { signal }),
  joinRoom: (inviteCode: string, displayName: string) =>
    request<Room>(`/api/rooms/${encode(inviteCode)}/participants`, { method: "POST", body: JSON.stringify({ display_name: displayName }) }),
  getSubmission: (inviteCode: string) => request<Submission>(`/api/rooms/${encode(inviteCode)}/submission`),
  saveSubmission: (inviteCode: string, body: SaveSubmissionBody) =>
    request<Submission>(`/api/rooms/${encode(inviteCode)}/submission`, { method: "PUT", body: JSON.stringify(body) }),
  closeRoom: (inviteCode: string, confirmEarly = false) =>
    request<Room>(`/api/rooms/${encode(inviteCode)}/close`, { method: "POST", body: JSON.stringify({ confirm_early: confirmEarly }) }),
  retryAnalysis: (inviteCode: string) => request<Room>(`/api/rooms/${encode(inviteCode)}/analysis/retry`, { method: "POST" }),
  getCandidates: (inviteCode: string) => request<CandidateList>(`/api/rooms/${encode(inviteCode)}/candidates`),
  getUnappliedInputs: (inviteCode: string) => request<UnappliedInput[]>(`/api/rooms/${encode(inviteCode)}/candidates/unapplied-inputs`),
  confirmCandidate: (inviteCode: string, candidateId: string) =>
    request<ConfirmedResult>(`/api/rooms/${encode(inviteCode)}/candidates/${encode(candidateId)}/confirmation`, { method: "POST" }),
  getResult: (inviteCode: string) => request<ConfirmedResult>(`/api/rooms/${encode(inviteCode)}/result`),
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
      SUBMISSION_INPUT_REQUIRED: "자연어 조건이나 가능한 시간을 하나 이상 입력해 주세요.",
      ANALYSIS_NOT_DELAYED: "현재는 재분석이 필요한 상태가 아닙니다.",
      CANDIDATES_NOT_READY: "후보를 아직 준비하고 있습니다.",
      CANDIDATE_ALREADY_CONFIRMED: "다른 후보가 이미 확정되었습니다.",
    };
    return (error.problem.code && fallback[error.problem.code]) || error.problem.detail || error.message;
  }
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
