import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import "../src/styles.css";

// Development-only, synthetic transport. No production URL, credentials or model call.
if (!import.meta.env.DEV) throw new Error("Synthetic review is available only on the local development server");
const code = "syntheticEvidenceRoom1";
const prefix = `/api/rooms/${code}`;
const mode = new URLSearchParams(location.search).get("state") ?? "question";
const host = mode === "unapplied";
const now = "2026-11-01T03:00:00Z";
const raw = "토요일 7~8시 온라인만 가능, 일요일은 불가";
const question = { id: "33333333-3333-4333-8333-333333333333", text: "7~8시는 오전인가요, 오후인가요?", source_excerpt: "7~8시", answer_mode: mode === "text" ? "TEXT_ONLY" : "CHOICE_OR_TEXT", options: mode === "text" ? [] : [{ id: "A", text: "오전", proposed_text: "오전 7~8시" }, { id: "B", text: "오후", proposed_text: "오후 7~8시" }] };
const evidence = { protocol: "PRE_SUBMIT_V2", original_revision: 1, reference_at: now, supplement: null as null | Record<string, unknown>, interpretation: "PENDING", unresolved_reason: null as string | null };
const version = { revision: 1, raw_text: raw, created_at: now, interpretation_reference_at: now, evidence };
const received = ["received", "unapplied"].includes(mode);
const closed = mode === "unapplied";
const snapshot = {
  candidate: { ...version }, accepted: null as null | Record<string, unknown>, check: { id: "22222222-2222-4222-8222-222222222222", status: received ? "RECEIVED" : "NEEDS_CHOICE", version: 2, retry_allowed: false, failure_code: null, question: received ? null : question },
  submission_complete: received, applied_to_result: closed, room: { collection_status: closed ? "CLOSED" : "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null,
};
function receive(answer: string, choice: string | null) {
  const finalizedEvidence = { ...evidence, interpretation: "UNRESOLVED", unresolved_reason: "MATERIAL_AMBIGUITY", supplement: { question_id: question.id, source_revision: 1, source_excerpt: "7~8시", source_start_code_point: 4, prompt: question.text, answer_text: answer, choice_id: choice, answered_at: now, reference_at: now } };
  snapshot.candidate = { ...version, revision: 2, evidence: finalizedEvidence };
  snapshot.accepted = { ...version, evidence: finalizedEvidence, confirmation_source: "PRECHECK_UNRESOLVED" };
  snapshot.check = { ...snapshot.check, status: "RECEIVED", version: 3, question: null };
  snapshot.submission_complete = true;
}
if (received) receive("퇴근하면 가능해요", null);
const room = { invite_code: code, purpose: "V2 로직 검토 · 합성 데이터만 사용", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-11-01", search_end_date: "2026-11-15", search_range_source: "HOST_SPECIFIED", expected_participants: 4, submission_deadline: null, manual_only: true, collection_status: closed ? "CLOSED" : "COLLECTING", closure_reason: closed ? "MANUAL" : null, closed_at: closed ? now : null, public_status: closed ? "NO_MATCH" : "COLLECTING", state_version: 1, viewer: { joined: true, display_name: host ? "합성 주최자" : "합성 참여자", role: host ? "HOST" : "MEMBER", context_id: "11111111-1111-4111-8111-111111111111" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V2", review_prompt_supported: false };
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url, location.origin);
  const method = init?.method ?? "GET";
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url.origin !== location.origin) throw new Error("Synthetic review blocks external API requests");
  if (url.pathname === "/api/auth/refresh") return respond({ accessToken: "synthetic-local-review", expiresAt: new Date(Date.now() + 900_000).toISOString(), account: { id: "11111111-2222-4333-8444-555555555555", displayName: "합성 검토 계정" } });
  if (method === "GET" && url.pathname === prefix) return respond(room);
  if (method === "GET" && url.pathname === `${prefix}/submission/checks/current`) return respond(snapshot);
  if (method === "GET" && url.pathname === `${prefix}/candidates/unapplied-inputs`) return respond([{ participant_display_name: "합성 참여자", raw_text: raw, reason: "AMBIGUOUS_TIME_CONSTRAINT", finalized_answer: "퇴근하면 가능해요", failure_scope: "TIME" }]);
  if (method === "POST" && url.pathname === `${prefix}/submission/checks/${snapshot.check.id}/answer`) {
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    receive(body.direct_text ?? question.options.find(option => option.id === body.choice_id)?.proposed_text ?? "합성 답변", body.choice_id ?? null);
    return respond(snapshot, 202);
  }
  return respond({ code: "SYNTHETIC_REVIEW_UNSUPPORTED", detail: "이 동작은 합성 검토 화면에서 제공하지 않아요. 운영 서버에는 요청하지 않았어요." }, 409);
};
const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
createRoot(document.getElementById("root")!).render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/rooms/${code}`]}><aside className="glass-card page-width"><h1>V2 계약 검토 · 합성 데이터</h1><p>실제 서버·DB·모델을 사용하지 않는 로컬 화면입니다.</p><nav className="actions">{[["question", "A/B 질문"], ["text", "직접 답변 질문"], ["received", "미확정 접수"], ["unapplied", "주최자 미반영 사유"]].map(([state, label]) => <a className="button secondary" key={state} href={`?state=${state}`}>{label}</a>)}</nav></aside><App /></MemoryRouter></QueryClientProvider>);
