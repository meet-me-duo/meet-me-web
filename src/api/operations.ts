import { z } from "zod";

export interface OperationRoom {
  id: string; created_at: string; meeting_mode: "IN_PERSON" | "REMOTE" | "EITHER"; time_zone_id: string;
  search_start_date: string; search_end_date: string; expected_participants: number | null;
  submission_deadline: string | null; manual_only: boolean; collection_status: "COLLECTING" | "CLOSED";
  closure_reason: "EXPECTED_PARTICIPANTS" | "DEADLINE" | "MANUAL" | null; closed_at: string | null;
  participant_count: number; submitted_participant_count: number; host_submitted: boolean; current_run_status: string | null;
}
export interface OperationInvocation {
  id: string; run_id: string; run_version: number; started_at: string; deadline_at: string; finished_at: string | null;
  winner_attempt_id: string | null; gemini_admitted_attempts: number; luna_admitted_attempts: number;
  execution_ordinal: number; revision_linked: boolean; recorded_elapsed_millis: number | null;
  parser_dispatch_count: number | null; http_request_count: null;
  client_call_count?: number | null; known_client_call_count?: number;
  transport_observed_attempt_count?: number; transport_unknown_attempt_count?: number;
}
export interface OperationClientCall {
  call_number: number; elapsed_nanos: number; outcome: "COMPLETED" | "FAILED"; http_status: number | null;
}
export interface OperationAttempt {
  id: string; attempt_number: number; provider: "GEMINI" | "OPENAI"; model: string; policy_version: string;
  started_at: string; finished_at: string | null; failure_kind: string | null; input_tokens: number | null;
  output_tokens: number | null; estimated_cost_usd: string | null; recorded_elapsed_millis: number | null;
  parser_dispatched: boolean | null; role: "INITIAL" | "RETRY" | "FALLBACK";
  client_calls?: OperationClientCall[] | null;
}
export interface OperationUsage {
  provider: "GEMINI" | "OPENAI"; recorded_attempt_count: number; input_known_count: number; output_known_count: number;
  cost_known_count: number; input_unknown_count: number; output_unknown_count: number; cost_unknown_count: number;
  known_input_tokens: number | null; known_output_tokens: number | null; known_cost_usd: string | null;
  coverage_basis: "RECORDED_ADMISSIONS";
}
export interface OperationRooms { items: OperationRoom[]; next_cursor: string | null }
export interface OperationRoomDetail {
  room: OperationRoom; invocations: OperationInvocation[]; next_cursor: string | null;
  revision_counts: { open: number; queued: number; reused: number }; legacy_attempt_count: number;
}
export interface OperationInvocationDetail {
  room_id: string; invocation: OperationInvocation; attempts: OperationAttempt[]; usage_by_provider: OperationUsage[];
}
export interface OperationsApi {
  rooms(cursor?: string, signal?: AbortSignal): Promise<OperationRooms>;
  room(roomId: string, cursor?: string, signal?: AbortSignal): Promise<OperationRoomDetail>;
  invocation(invocationId: string, signal?: AbortSignal): Promise<OperationInvocationDetail>;
}
export class OperationsError extends Error {
  constructor(public readonly status: number) { super("운영 요약 조회 실패"); this.name = "OperationsError"; }
}
export function operationsMessage(error: unknown): string {
  if (error instanceof OperationsError) {
    const messages: Record<number, string> = {
      400: "조회 요청을 확인해 주세요.", 401: "운영자 인증이 필요합니다.",
      403: "운영 조회 권한이 없습니다.", 404: "조회 대상을 찾을 수 없습니다.",
      503: "운영 요약을 일시적으로 조회할 수 없습니다.",
    };
    return messages[error.status] ?? "운영 요약 조회에 실패했습니다.";
  }
  return "운영 요약 조회에 실패했습니다.";
}

const uuid = z.string().uuid();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.string().datetime({ offset: true });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimal = z.string().max(128).regex(/^\d+(?:\.\d+)?$/).nullable();
const cursor = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/);
const provider = z.enum(["GEMINI", "OPENAI"]);
const roomSchema = z.object({
  id: uuid, created_at: instant, meeting_mode: z.enum(["IN_PERSON", "REMOTE", "EITHER"]),
  time_zone_id: z.string().min(1).max(100).regex(/^[A-Za-z0-9/_+:-]+$/),
  search_start_date: date, search_end_date: date, expected_participants: count.nullable(),
  submission_deadline: instant.nullable(), manual_only: z.boolean(), collection_status: z.enum(["COLLECTING", "CLOSED"]),
  closure_reason: z.enum(["EXPECTED_PARTICIPANTS", "DEADLINE", "MANUAL"]).nullable(), closed_at: instant.nullable(),
  participant_count: count, submitted_participant_count: count, host_submitted: z.boolean(),
  current_run_status: z.enum(["QUEUED", "STRUCTURING", "MATCHING", "COMPLETED", "ANALYSIS_DELAYED", "DEAD_LETTERED"]).nullable(),
});
const invocationSchema = z.object({
  id: uuid, run_id: uuid, run_version: count, started_at: instant, deadline_at: instant, finished_at: instant.nullable(),
  winner_attempt_id: uuid.nullable(), gemini_admitted_attempts: count, luna_admitted_attempts: count,
  execution_ordinal: count, revision_linked: z.boolean(), recorded_elapsed_millis: count.nullable(),
  parser_dispatch_count: count.nullable(), http_request_count: z.null(),
  client_call_count: count.nullable().optional().default(null),
  known_client_call_count: count.optional().default(0),
  transport_observed_attempt_count: count.optional().default(0),
  transport_unknown_attempt_count: count.optional(),
}).transform(item => ({ ...item, transport_unknown_attempt_count: item.transport_unknown_attempt_count ?? item.gemini_admitted_attempts + item.luna_admitted_attempts }));
const clientCallSchema = z.object({
  call_number: count.min(1).max(256), elapsed_nanos: count,
  outcome: z.enum(["COMPLETED", "FAILED"]), http_status: count.min(100).max(599).nullable(),
});
const attemptSchema = z.object({
  id: uuid, attempt_number: count, provider, model: z.string().min(1).max(200), policy_version: z.string().min(1).max(200),
  started_at: instant, finished_at: instant.nullable(),
  failure_kind: z.enum(["NETWORK", "TIMEOUT", "RATE_LIMIT", "SERVER", "INVALID_RESPONSE", "CONFIGURATION", "AUTHENTICATION", "PERMISSION", "BILLING", "QUOTA", "INVALID_REQUEST", "PUBLICATION_FENCED", "OTHER"]).nullable(),
  input_tokens: count.nullable(), output_tokens: count.nullable(), estimated_cost_usd: decimal,
  recorded_elapsed_millis: count.nullable(), parser_dispatched: z.boolean().nullable(), role: z.enum(["INITIAL", "RETRY", "FALLBACK"]),
  client_calls: z.array(clientCallSchema).max(256).nullable().optional().default(null),
}).refine(item => item.client_calls === null ? item.parser_dispatched === null : item.parser_dispatched !== null &&
  (item.parser_dispatched || item.client_calls.length === 0) && item.client_calls.every((call, index) => call.call_number === index + 1));
const usageSchema = z.object({
  provider, recorded_attempt_count: count, input_known_count: count, output_known_count: count, cost_known_count: count,
  input_unknown_count: count, output_unknown_count: count, cost_unknown_count: count,
  known_input_tokens: count.nullable(), known_output_tokens: count.nullable(), known_cost_usd: decimal,
  coverage_basis: z.literal("RECORDED_ADMISSIONS"),
});
const roomsSchema = z.object({ items: z.array(roomSchema).max(100), next_cursor: cursor.nullable() });
const roomDetailSchema = z.object({
  room: roomSchema, invocations: z.array(invocationSchema).max(100), next_cursor: cursor.nullable(),
  revision_counts: z.object({ open: count, queued: count, reused: count }), legacy_attempt_count: count,
});
const invocationDetailSchema = z.object({
  room_id: uuid, invocation: invocationSchema, attempts: z.array(attemptSchema), usage_by_provider: z.array(usageSchema).max(2),
});
const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
type AccessTokenSupplier = () => string | null | undefined;
async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, getAccessToken?: AccessTokenSupplier): Promise<T> {
  function currentToken() {
    try { return getAccessToken?.() || null; }
    catch { throw new OperationsError(503); }
  }
  if (signal?.aborted) throw new OperationsError(401);
  const token = currentToken();
  function checkContext() {
    if (signal?.aborted || currentToken() !== token) throw new OperationsError(401);
  }
  try {
    const response = await fetch(`${base}${path}`, {
      method: "GET", credentials: "include", cache: "no-store", signal,
      headers: { Accept: "application/json, application/problem+json", "Accept-Language": "ko-KR", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    checkContext();
    // Error payloads can contain arbitrary upstream details; never read or retain them.
    if (!response.ok) throw new OperationsError(response.status);
    const result = schema.parse(await response.json());
    checkContext();
    return result;
  } catch (error) {
    if (error instanceof OperationsError) throw error;
    // Upstream/validation exceptions may contain headers or input values.
    throw new OperationsError(503);
  }
}
function pageQuery(next?: string) {
  const query = new URLSearchParams({ limit: "20" });
  if (next !== undefined) {
    if (!cursor.safeParse(next).success) throw new OperationsError(400);
    query.set("cursor", next);
  }
  return query.toString();
}
function resourceId(value: string) {
  if (!uuid.safeParse(value).success) throw new OperationsError(400);
  return encodeURIComponent(value);
}
// #109 owns the actual memory session; this boundary never stores or acquires credentials.
export function createOperationsApi(getAccessToken?: AccessTokenSupplier): OperationsApi {
  return {
    rooms: async (next, signal) => read(`/api/operations/rooms?${pageQuery(next)}`, roomsSchema, signal, getAccessToken),
    room: async (id, next, signal) => read(`/api/operations/rooms/${resourceId(id)}?${pageQuery(next)}`, roomDetailSchema, signal, getAccessToken),
    invocation: async (id, signal) => read(`/api/operations/invocations/${resourceId(id)}`, invocationDetailSchema, signal, getAccessToken),
  };
}
export const operationsApi = createOperationsApi();
