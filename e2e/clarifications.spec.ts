// #107 browser-to-HTTP mock contracts. No production server or AI is contacted.
import { expect, test, type Page } from "@playwright/test";
import { fulfillAccountRefresh } from "./accountFixture";

const code = "abcdefghijklmnopqrstuv";
const analysis = "11111111-1111-4111-8111-111111111111";
const round = "22222222-2222-4222-8222-222222222222";
const context = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const question = { question_id: questionId, source_revision: 7, excerpt: "내일 7시 가능", question: "오전인가요 오후인가요?", option_a: "내일 오전 7시 가능", option_b: "내일 오후 7시 가능" };
async function fixture(page: Page, baseURL: string, options: { member?: boolean; marker?: boolean; open?: boolean; pending?: boolean } = {}) {
  const origin = new URL(baseURL).origin; const root = `/api/rooms/${code}`;
  const writes: { path: string; body: Record<string, unknown> }[] = []; const unexpected: string[] = []; const errors: string[] = [];
  let open = options.open ?? false; let answered = false; let denied = false; let version = open ? 11 : 10; let status = open ? "COLLECTING" : "NO_MATCH";
  let text = question.excerpt; let revision = 7; let questionReads = 0;
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  const snapshot = () => ({
    invite_code: code, purpose: "합성 보완 질문 브라우저 검증", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
    search_start_date: "2026-10-18", search_end_date: "2026-10-25", search_range_source: "HOST_SPECIFIED",
    expected_participants: 2, submission_deadline: null, manual_only: false, collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-17T03:00:00Z",
    public_status: status, viewer: { joined: true, role: options.member ? "MEMBER" : "HOST", display_name: "합성 본인", context_id: context }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
    state_version: version, revision_generation: open ? 1 : 0, revision_round: open ? { id: round, generation: 1, status: "OPEN" } : null, analysis_id: analysis,
    capabilities: { can_edit_own_submission: open, can_open_revision: !options.member && status === "NO_MATCH" && !open, can_analyze_revision: !options.member && open, can_confirm: false, can_force_reparse: false }, remaining_correction_analyses: 3,
    ...(options.marker === false ? {} : { clarification_protocol: "owner-clarification-v1" }),
  });
  const own = () => ({ raw_text: text, revision, editable: open, locale: "ko-KR", created_at: "2026-10-17T03:00:00Z" });
  const openRound = () => { open = true; version++; status = "COLLECTING"; };
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    if (url.origin !== origin) { unexpected.push(method + " " + request.url()); return route.abort(); }
    if (await fulfillAccountRefresh(route, options.member ? null : "합성 본인")) return;
    if (!url.pathname.startsWith("/api/")) { if (method === "GET") return route.continue(); unexpected.push(method + " " + url.pathname); return route.abort(); }
    if (method === "GET" && url.pathname === root) return denied ? route.fulfill({ status: 401, json: { detail: "합성 세션 회수" } }) : route.fulfill({ json: snapshot() });
    if (method === "GET" && url.pathname === root + "/submission") return route.fulfill({ json: own() });
    if (method === "GET" && url.pathname === root + "/submission/clarifications") { questionReads++; return route.fulfill({ json: { questions: answered ? [] : [{ ...question, editable: open }], state_version: version } }); }
    if (method === "GET" && url.pathname === root + "/candidates/unapplied-inputs" && !options.member) return route.fulfill({ json: [] });
    if (method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push({ path: url.pathname, body });
      if (url.pathname === root + "/reopen" && !options.member && !open) {
        expect(body).toEqual({ request_id: expect.stringMatching(uuid), source_analysis_id: analysis, expected_generation: 0 }); openRound();
        return route.fulfill({ json: { room: snapshot(), round: { id: round, generation: 1, status: "OPEN" } } });
      }
      if (url.pathname === root + `/submission/clarifications/${questionId}/answer` && open) {
        expect(body).toEqual({ request_id: expect.stringMatching(uuid), revision_round_id: round, expected_revision: 7, choice: "B" });
        if (options.pending) await pending;
        text = question.option_b; revision = 8; answered = true;
        return route.fulfill({ json: { status: "ANSWERED", submission: own() } });
      }
      if (url.pathname === root + "/analysis" && !options.member && open) {
        expect(body).toEqual({ request_id: expect.stringMatching(uuid), revision_round_id: round, force_reparse: false });
        open = false; version++; status = "ANALYZING";
        return route.fulfill({ status: 202, json: { outcome: "QUEUED", analysis_id: analysis, revision_round_id: round, room: snapshot() } });
      }
    }
    unexpected.push(method + " " + url.pathname); return route.abort();
  });
  return { writes, unexpected, errors, openRound, questionReads: () => questionReads, deny: () => { denied = true; }, release };
}

test("HOST opens read-only own question, saves one answer and explicitly requests analysis", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!); await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("radio", { name: question.option_b })).toBeDisabled();
  await page.getByRole("button", { name: "조건 수정 열기" }).click();
  await expect(page.getByRole("radio", { name: question.option_b })).toBeEnabled();
  expect(mock.writes).toHaveLength(1);
  await page.getByRole("radio", { name: question.option_b }).check(); await page.getByRole("button", { name: "답변 저장" }).click();
  await expect(page.getByText(/답변을 새 입력으로 저장/)).toBeVisible();
  await expect(page.getByText("저장된 입력 #8")).toBeVisible();
  expect(mock.writes).toHaveLength(2);
  await page.getByRole("button", { name: "수정한 조건으로 다시 분석" }).click();
  await expect(page.getByRole("heading", { name: "모두의 조건을 분석하고 있어요" })).toBeVisible();
  expect(mock.writes.map(write => write.path)).toEqual([`/api/rooms/${code}/reopen`, `/api/rooms/${code}/submission/clarifications/${questionId}/answer`, `/api/rooms/${code}/analysis`]);
  expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("MEMBER sees a persisted own question after refresh, then answers an externally opened round", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!, { member: true }); await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("radio", { name: question.option_b })).toBeDisabled(); await page.reload();
  await expect(page.getByText(question.question)).toBeVisible(); expect(mock.writes).toHaveLength(0);
  mock.openRound();
  // Reload restores the host-opened round from the persisted room and question APIs.
  await page.reload();
  await expect(page.getByRole("radio", { name: question.option_b })).toBeEnabled();
  await page.getByRole("radio", { name: question.option_b }).check(); await page.getByRole("button", { name: "답변 저장" }).click();
  await expect(page.getByText(/답변을 새 입력으로 저장/)).toBeVisible();
  await expect(page.getByRole("button", { name: "수정한 조건으로 다시 분석" })).toHaveCount(0);
  await page.reload(); await expect(page.getByText("저장된 입력 #8")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(mock.writes).toHaveLength(1); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  expect(await page.evaluate(value => Object.values({ ...localStorage, ...sessionStorage }).some(item => String(item).includes(value)), question.option_b)).toBe(false);
});

test("old server without rollout marker receives no clarification endpoint request", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!, { marker: false }); await page.goto(`/rooms/${code}`);
  await expect(page.getByText("내 저장 입력 확인")).toBeVisible(); await page.reload();
  await expect(page.getByText("내 저장 입력 확인")).toBeVisible();
  expect(mock.questionReads()).toBe(0); expect(mock.writes).toHaveLength(0);
  await expect(page.getByRole("radio")).toHaveCount(0); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
});

test("room access revocation while answer is pending never revives private UI on late success", async ({ page, baseURL }) => {
  const mock = await fixture(page, baseURL!, { open: true, pending: true }); await page.goto(`/rooms/${code}`);
  await page.getByRole("radio", { name: question.option_b }).check(); await page.getByRole("button", { name: "답변 저장" }).click();
  await expect(page.getByRole("button", { name: "저장 중…" })).toBeDisabled(); mock.deny();
  await expect(page.getByRole("heading", { name: "모임을 불러오지 못했어요" })).toBeVisible({ timeout: 8000 });
  mock.release();
  await expect(page.getByText(/답변을 새 입력으로 저장/)).toHaveCount(0); await expect(page.getByText(question.excerpt)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "모임을 불러오지 못했어요" })).toBeVisible();
  expect(mock.writes).toHaveLength(1); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
});
