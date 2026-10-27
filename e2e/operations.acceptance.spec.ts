import { expect, test } from "@playwright/test";

const roomId = "11000000-0000-4000-8000-000000000001";
const invocationId = "22000000-0000-4000-8000-000000000001";
const secret = "BROWSER_PRIVATE_RAW_OWNER_TOKEN";
const room = {
  id: roomId, created_at: "2026-10-01T01:00:00Z", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
  search_start_date: "2026-10-18", search_end_date: "2026-10-20", expected_participants: null,
  submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null,
  closed_at: null, participant_count: 1, submitted_participant_count: 0, host_submitted: false,
  current_run_status: null, purpose: secret, owner_id: secret,
};
const invocation = {
  id: invocationId, run_id: "33000000-0000-4000-8000-000000000001", run_version: 2,
  started_at: "2026-10-01T01:02:00Z", deadline_at: "2026-10-01T01:03:00Z", finished_at: null,
  winner_attempt_id: null, gemini_admitted_attempts: 1, luna_admitted_attempts: 0,
  execution_ordinal: 2, revision_linked: true, recorded_elapsed_millis: null,
  parser_dispatch_count: null, http_request_count: null, provider_response: secret,
};

for (const [status, message] of [[401, "운영자 인증이 필요합니다."], [403, "운영 조회 권한이 없습니다."], [503, "운영 요약을 일시적으로 조회할 수 없습니다."]] as const) {
  test(`operations uses fixed ${status} UI despite host cookie or forged identity hints`, async ({ page, context }) => {
    await context.addCookies([{ name: "meet_me_guest", value: "host-cookie-is-not-operator", url: "http://127.0.0.1:4173" }]);
    const requests: string[] = [];
    await page.route("**/api/**", async route => {
      if (new URL(route.request().url()).pathname === "/api/auth/refresh") {
        expect(route.request().method()).toBe("POST");
        expect(route.request().headers().authorization).toBeUndefined();
        return route.fulfill({ status: 401, json: {}, headers: { "Cache-Control": "no-store" } });
      }
      requests.push(route.request().url());
      await route.fulfill({ status, contentType: "application/problem+json", headers: { "Cache-Control": "no-store" }, json: { code: "PRIVATE_CODE", title: secret, detail: secret, stack: secret } });
    });
    await page.goto("/operations?operator_id=host&role=HOST");
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(secret);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    expect(requests.every(url => new URL(url).pathname === "/api/operations/rooms")).toBe(true);
    const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(storage).toEqual({ local: {}, session: {} });
  });
}

test("mock operator drilldown preserves unknown values and erases the summary after access loss", async ({ page }) => {
  let deny = false;
  const requests: { method: string; url: string; headers: Record<string, string> }[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    if (new URL(request.url()).pathname === "/api/auth/refresh") {
      expect(request.method()).toBe("POST");
      expect(request.headers().authorization).toBeUndefined();
      return route.fulfill({ status: 401, json: {}, headers: { "Cache-Control": "no-store" } });
    }
    requests.push({ method: request.method(), url: request.url(), headers: request.headers() });
    const path = new URL(request.url()).pathname;
    if (deny) return route.fulfill({ status: 403, contentType: "application/problem+json", json: { detail: secret } });
    if (path === "/api/operations/rooms") return route.fulfill({ json: { items: [room], next_cursor: null } });
    if (path === `/api/operations/rooms/${roomId}`) return route.fulfill({ json: { room, invocations: [invocation], next_cursor: null, revision_counts: { open: 1, queued: 2, reused: 3 }, legacy_attempt_count: 4 } });
    if (path === `/api/operations/invocations/${invocationId}`) return route.fulfill({ json: {
      room_id: roomId, invocation, attempts: [{ id: "44000000-0000-4000-8000-000000000001", attempt_number: 1,
        provider: "GEMINI", model: "mock-model", policy_version: "v1", started_at: invocation.started_at, finished_at: null,
        failure_kind: null, input_tokens: null, output_tokens: null, estimated_cost_usd: null,
        recorded_elapsed_millis: null, parser_dispatched: null, role: "INITIAL", owner_token: secret }],
      usage_by_provider: [{ provider: "GEMINI", recorded_attempt_count: 1, input_known_count: 0,
        output_known_count: 0, cost_known_count: 0, input_unknown_count: 1, output_unknown_count: 1, cost_unknown_count: 1,
        known_input_tokens: null, known_output_tokens: null, known_cost_usd: null, coverage_basis: "RECORDED_ADMISSIONS" }],
    } });
    return route.abort();
  });
  await page.goto("/operations");
  await page.getByRole("button", { name: `방 ${roomId}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "현재 방 설정" })).toBeVisible();
  await expect(page.locator("body")).toContainText(/호스트.*미제출/);
  await page.getByRole("button", { name: `실행 ${invocationId}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "실행 기록 상세" })).toBeVisible();
  await expect(page.locator("body")).toContainText(/HTTP.*알 수 없음/);
  await expect(page.locator("body")).toContainText("알려진 비용 소계");
  await expect(page.locator("body")).not.toContainText(secret);
  await expect(page.locator("body")).not.toContainText(/전체 비용|최종 발행 성공/);
  deny = true;
  await page.getByRole("button", { name: "방 목록", exact: true }).click();
  await expect(page.getByText("운영 조회 권한이 없습니다.", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(roomId);
  await expect(page.locator("body")).not.toContainText(invocationId);
  await expect(page.locator("body")).not.toContainText("mock-model");
  for (const request of requests) {
    expect(request.method).toBe("GET");
    expect(request.headers.authorization).toBeUndefined();
    expect(request.headers["x-user-id"]).toBeUndefined();
    expect(request.headers["x-operator-id"]).toBeUndefined();
    const url = new URL(request.url);
    expect(url.searchParams.has("operator_id")).toBe(false);
    if (url.pathname.includes("/rooms")) expect(url.searchParams.get("limit")).toBe("20");
  }
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual({ local: {}, session: {} });
});
