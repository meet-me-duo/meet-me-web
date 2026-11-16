import { z } from "zod";

export interface OperationRoom {
  title?: string; active_analysis_id?: string | null; state_version?: number; current_analysis_confirmed?: boolean; has_open_revision_round?: boolean;
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
  analyses(roomId: string, cursor?: string, signal?: AbortSignal): Promise<OperationAnalyses>;
  diagnostics(roomId: string, analysisId: string | null, signal?: AbortSignal): Promise<OperationDiagnostics>;
  reanalyze(roomId: string, body: OperationReanalysisRequest, signal?: AbortSignal): Promise<OperationReanalysisReceipt>;
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
      409: "현재 상태에서는 다시 분석할 수 없어요. 최신 모임 상태를 확인해 주세요.",
      429: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
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
  title: z.string().max(4000).optional(),
  active_analysis_id: uuid.nullable().optional(), state_version: count.optional(),
  current_analysis_confirmed: z.boolean().optional(), has_open_revision_round: z.boolean().optional(),
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
const analysisSchema = z.object({
  id: uuid, status: z.enum(["QUEUED", "STRUCTURING", "MATCHING", "COMPLETED", "ANALYSIS_DELAYED", "DEAD_LETTERED"]),
  created_at: instant, fixed_at: instant, active: z.boolean(), contract: z.string().min(1).max(128),
});
const questionSchema = z.object({
  prompt: z.string().max(4000), excerpt: z.string().max(4000).nullable(), answer: z.string().max(4000).nullable(),
  answered_at: instant.nullable(), consumed: z.boolean(), choices: z.array(z.string().max(4000)).max(4),
  source_raw_text: z.string().max(4000).nullable(),
});
const assessmentSchema = z.enum(["CLEAR", "NEEDS_REVIEW", "INDETERMINATE"]);
const classificationSchema = z.object({
  assessment: assessmentSchema, semantic_assessment: assessmentSchema.nullable(), effective_assessment: assessmentSchema.nullable(),
  reason: z.enum(["LOW_CONFIDENCE", "REFUSED", "MODEL_UNCERTAIN"]).nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
  provider: z.string().min(1).max(256), model: z.string().min(1).max(256),
  probabilities: z.partialRecord(assessmentSchema, z.number().finite().min(0).max(1)),
});
const personalAttemptSchema = z.object({
  generation: count, started_at: instant.nullable(), finished_at: instant.nullable(),
  failure_code: z.string().max(64).nullable(), classification: classificationSchema.nullable(),
});
const checkSchema = z.object({
  raw_text: z.string().max(4000), created_at: instant, reference_at: instant, current_status: z.string().max(64),
  question: questionSchema.nullable(), attempts: z.array(personalAttemptSchema).max(8), attempts_truncated: z.boolean(),
});
const storedInterpretationSchema = z.object({
  coverage: z.string().max(64), conditions: z.array(z.object({
    effect: z.string().max(64), interpretation: z.string().max(64), temporal_resolution: z.string().max(64),
    dimension: z.string().max(64).nullable(), start: z.string().max(80).nullable(), end: z.string().max(80).nullable(),
  })).max(64), problems: z.array(z.string().max(128)).max(64), truncated: z.boolean(),
});
const inputSchema = z.object({
  alias: z.string().regex(/^참가자 [0-9A-F]{8}$/), display_name: z.string().max(400),
  revision: count.nullable(), raw_text: z.string().max(4000).nullable(), created_at: instant.nullable(), reference_at: instant.nullable(),
  interpretation: z.enum(["PENDING", "CONFIRMED", "UNRESOLVED"]).nullable(), unresolved_reason: z.string().max(256).nullable(),
  supplement: questionSchema.nullable(), checks: z.array(checkSchema).max(8), checks_truncated: z.boolean(),
  legacy_questions: z.array(questionSchema).max(8), stored_interpretation: storedInterpretationSchema.nullable(),
});
const analysesSchema = z.object({ items: z.array(analysisSchema).max(100), next_cursor: cursor.nullable() });
const diagnosticsSchema = z.object({
  room_id: uuid, scope: z.enum(["CURRENT_COLLECTION", "FROZEN_ANALYSIS"]), analysis: analysisSchema.nullable(),
  inputs: z.array(inputSchema).max(50), inputs_truncated: z.boolean(),
  invocations: z.array(invocationDetailSchema).max(20), invocations_truncated: z.boolean(),
  timeline: z.array(z.object({ kind: z.string().max(64), at: instant.nullable(), status: z.string().max(64) })).max(100),
  timeline_truncated: z.boolean(), results: z.array(z.object({
    start_at: instant, end_at: instant, meeting_mode: z.enum(["IN_PERSON", "REMOTE"]), place_name: z.string().max(4000).nullable(),
    place_unverified: z.boolean(), available_aliases: z.array(z.string().regex(/^참가자 [0-9A-F]{8}$/)).max(50),
  })).max(20), results_truncated: z.boolean(),
});
const reanalysisRequestSchema = z.object({
  request_id: uuid, source_analysis_id: uuid, expected_state_version: count.max(Number.MAX_SAFE_INTEGER - 1),
}).strict();
const receiptSchema = z.object({
  request_id: uuid, source_analysis_id: uuid, analysis_id: uuid, accepted_state_version: count,
  accepted_at: instant, analysis_contract_version: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
});
export type OperationAnalysis = z.infer<typeof analysisSchema>;
export type OperationAnalyses = z.infer<typeof analysesSchema>;
export type OperationClassification = z.infer<typeof classificationSchema>;
export type OperationInput = z.infer<typeof inputSchema>;
export type OperationQuestion = z.infer<typeof questionSchema>;
export type OperationDiagnostics = z.infer<typeof diagnosticsSchema>;
export type OperationReanalysisRequest = z.infer<typeof reanalysisRequestSchema>;
export type OperationReanalysisReceipt = z.infer<typeof receiptSchema>;

const base = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
type AccessTokenSupplier = () => string | null | undefined;
async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal, getAccessToken?: AccessTokenSupplier): Promise<T> {
  function currentToken() {
    try { return getAccessToken?.() || null; }
    catch (error) { if (error instanceof OperationsError) throw error; throw new OperationsError(503); }
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
    analyses: async (id, next, signal) => read(`/api/operations/rooms/${resourceId(id)}/analyses?${pageQuery(next)}`, analysesSchema, signal, getAccessToken),
    diagnostics: async (id, analysis, signal) => {
      const query = analysis === null ? "" : `?analysis_id=${resourceId(analysis)}`;
      const result = await read(`/api/operations/rooms/${resourceId(id)}/diagnostics${query}`, diagnosticsSchema, signal, getAccessToken);
      if (result.room_id !== id || (analysis === null
        ? result.scope !== "CURRENT_COLLECTION" || result.analysis !== null
        : result.scope !== "FROZEN_ANALYSIS" || result.analysis?.id !== analysis)) throw new OperationsError(503);
      if (result.invocations.some(execution => execution.room_id !== id || analysis === null || execution.invocation.run_id !== analysis)) throw new OperationsError(503);
      return result;
    },
    reanalyze: async (id, body, signal) => {
      const parsed = reanalysisRequestSchema.safeParse(body);
      if (!parsed.success) throw new OperationsError(400);
      const path = `/api/operations/rooms/${resourceId(id)}/analyses`;
      function currentToken() {
        try { return getAccessToken?.() || null; }
        catch (error) { if (error instanceof OperationsError) throw error; throw new OperationsError(503); }
      }
      if (signal?.aborted) throw new OperationsError(401);
      const token = currentToken();
      function checkContext() { if (signal?.aborted || currentToken() !== token) throw new OperationsError(401); }
      try {
        const response = await fetch(`${base}${path}`, {
          method: "POST", credentials: "include", cache: "no-store", signal,
          headers: { Accept: "application/json, application/problem+json", "Content-Type": "application/json", "Accept-Language": "ko-KR", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(parsed.data),
        });
        checkContext();
        if (response.status !== 202) throw new OperationsError(response.ok ? 503 : response.status);
        const result = receiptSchema.parse(await response.json());
        checkContext();
        if (result.request_id !== body.request_id || result.source_analysis_id !== body.source_analysis_id ||
          result.analysis_id === body.source_analysis_id || result.accepted_state_version <= body.expected_state_version) throw new OperationsError(503);
        return result;
      } catch (error) {
        if (error instanceof OperationsError) throw error;
        throw new OperationsError(503);
      }
    },
  };
}
export const operationsApi = createOperationsApi();
