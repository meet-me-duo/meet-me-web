import { expect, test, type Page } from "@playwright/test";

const roomId = "11000000-0000-4000-8000-000000000001";
const invocationId = "22000000-0000-4000-8000-000000000001";
const privateText = "TRANSPORT_PRIVATE_URL_HEADER_RAW_RESPONSE_SECRET";
const room = {
  id: roomId, created_at: "2026-10-17T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null,
  closed_at: null, participant_count: 1, submitted_participant_count: 0, host_submitted: false, current_run_status: null,
};
function fixture(partial: boolean) {
  const invocation = {
    id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
    started_at: room.created_at, deadline_at: "2026-10-17T01:01:00Z", finished_at: null,
    winner_attempt_id: null, gemini_admitted_attempts: partial ? 2 : 1, luna_admitted_attempts: partial ? 1 : 0,
    execution_ordinal: 1, revision_linked: false, recorded_elapsed_millis: null, http_request_count: null,
    parser_dispatch_count: partial ? null : 0, client_call_count: partial ? null : 0,
    known_client_call_count: partial ? 1 : 0, transport_observed_attempt_count: partial ? 2 : 1,
    transport_unknown_attempt_count: partial ? 1 : 0,
  };
  const attempt = {
    id: "44000000-0000-4000-8000-000000000001", attempt_number: 1, provider: "GEMINI", model: "gemini-3.8-flash",
    policy_version: "bounded-luna-v1", started_at: invocation.started_at, finished_at: null,
    failure_kind: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null,
    recorded_elapsed_millis: null, role: "INITIAL", parser_dispatched: false, client_calls: [],
    owner_token: privateText, raw_text: privateText,
  };
  const attempts = partial ? [
    { ...attempt, parser_dispatched: true, client_calls: [{ call_number: 1, elapsed_nanos: 123,
      outcome: "COMPLETED", http_status: 503, url: privateText, headers: { Authorization: privateText },
      request_body: privateText, response_body: privateText, exception_message: privateText }] },
    { ...attempt, id: "44000000-0000-4000-8000-000000000002", attempt_number: 2, role: "RETRY" },
    { ...attempt, id: "44000000-0000-4000-8000-000000000003", attempt_number: 3, provider: "OPENAI",
      model: "gpt-6-luna", role: "FALLBACK", parser_dispatched: null, client_calls: null },
  ] : [attempt];
  return { invocation, attempts };
}

async function drilldown(page: Page, partial: boolean) {
  const { invocation, attempts } = fixture(partial);
  const requests: { method: string; headers: Record<string, string> }[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    requests.push({ method: request.method(), headers: request.headers() });
    const path = new URL(request.url()).pathname;
    const headers = { "Cache-Control": "no-store" };
    if (path === "/api/operations/rooms") return route.fulfill({ headers, json: { items: [room], next_cursor: null } });
    if (path === `/api/operations/rooms/${roomId}`) return route.fulfill({ headers, json: {
      room, invocations: [invocation], next_cursor: null, revision_counts: { open: 0, queued: 0, reused: 1 }, legacy_attempt_count: 1,
    } });
    if (path === `/api/operations/invocations/${invocationId}`) return route.fulfill({ headers, json: {
      room_id: roomId, invocation, attempts, usage_by_provider: [], provider_response: privateText,
    } });
    return route.abort();
  });
  await page.goto("/operations");
  await page.getByRole("button", { name: new RegExp(roomId) }).click();
  await page.getByRole("button", { name: new RegExp(invocationId) }).click();
  const transport = page.getByRole("heading", { name: /로컬.*client call/i }).locator("..");
  await expect(transport).toBeVisible();
  return { transport, requests };
}

async function assertBoundaries(page: Page, requests: { method: string; headers: Record<string, string> }[]) {
  await expect(page.locator("body")).not.toContainText(privateText);
  await expect(page.locator("body")).not.toContainText(/공급자 수신 확인|청구 확정|exactly.once/i);
  for (const request of requests) {
    expect(request.method).toBe("GET");
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers["x-operator-id"]).toBeUndefined();
  }
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual({ local: {}, session: {} });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test("operator drilldown shows partial local coverage and a completed 503 without exposing transport payloads", async ({ page }, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
  const { transport, requests } = await drilldown(page, true);
  await expect(transport).toContainText(/관측.*2/);
  await expect(transport).toContainText(/미관측.*1/);
  await expect(transport).toContainText(/알려진.*1/);
  await expect(transport).toContainText("알 수 없음");
  const attempts = page.locator("article.operations-attempt");
  await expect(attempts).toHaveCount(3);
  await expect(attempts.nth(0)).toContainText(/COMPLETED.*503.*123\s*ns/);
  await expect(attempts.nth(1)).toContainText("진입 안 함");
  await expect(attempts.nth(1).locator("dt", { hasText: "로컬 client call 수" }).locator("+ dd")).toHaveText("0");
  await expect(attempts.nth(2).locator("dt", { hasText: "로컬 client call 수" }).locator("+ dd")).toHaveText("알 수 없음");
  await assertBoundaries(page, requests);
});

test("operator drilldown preserves complete known zero separately from unknown HTTP request count", async ({ page }, info) => {
  if (info.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
  const { transport, requests } = await drilldown(page, false);
  await expect(transport).toContainText(/관측.*1/);
  await expect(transport).toContainText(/미관측.*0/);
  await expect(transport).toContainText(/알려진.*0/);
  await expect(page.getByText("진입 안 함", { exact: true })).toBeVisible();
  await expect(page.locator("dt", { hasText: "Parser dispatch 횟수" }).locator("+ dd")).toHaveText("0");
  await expect(page.locator("dt", { hasText: "HTTP 요청 횟수" }).locator("+ dd")).toHaveText("알 수 없음");
  await assertBoundaries(page, requests);
});
