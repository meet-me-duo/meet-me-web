import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const candidate = {
  candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", meeting_mode: "REMOTE", rank: 1,
  attendance_count: 2, total_participants: 3,
  time_ranges: [{ start_at: "2026-09-22T10:00:00Z", end_at: "2026-09-22T12:00:00Z" }], place: null, summary: "화요일 저녁 비대면 일정",
};

async function mockApi(page: Page, options: { rawText?: string | null; status?: string; role?: "HOST" | "MEMBER"; failSave?: boolean; oldServer?: boolean; unappliedReason?: string; emptyCandidates?: boolean } = {}) {
  const status = options.status ?? "COLLECTING";
  let stored = options.rawText === undefined ? null : { revision: 1, raw_text: options.rawText, locale: "ko-KR", created_at: "2026-09-20T12:00:00Z", editable: true, manual_available_times: options.oldServer ? [{ kind: "DATED", date: "2026-09-22", day_of_week: null, start_time: "18:00", end_time: "20:00" }] : [] };
  const puts: unknown[] = [];
  const unappliedRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = request.url();
    if (url.endsWith("/submission")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        puts.push(body);
        if (options.failSave) return route.fulfill({ status: 400, json: { code: "SUBMISSION_TEXT_TOO_LONG" } });
        // Baseline ab7917e uses Kotlin trim, whose edge set adds U+001C..001F and excludes FEFF.
        // eslint-disable-next-line no-control-regex -- This fixture intentionally covers Kotlin C0 whitespace.
        const rawText = options.oldServer ? body.raw_text.replace(/^[\u0009-\u000d\u001c-\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g, "") : body.raw_text;
        if (!rawText) return route.fulfill({ status: 400, json: { code: "SUBMISSION_INPUT_REQUIRED" } });
        stored = { revision: (stored?.revision ?? 0) + 1, raw_text: rawText, locale: "ko-KR", created_at: "2026-09-20T13:00:00Z", editable: true, manual_available_times: [] };
      }
      return stored ? route.fulfill({ json: stored }) : route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    }
    if (url.endsWith("/unapplied-inputs")) {
      unappliedRequests.push(url);
      return route.fulfill({ json: [{ participant_display_name: "레거시 참여자", raw_text: null, reason: "LEGACY_MANUAL_ONLY_UNSUPPORTED" }, { participant_display_name: "다른 참여자", raw_text: "비공개 조건 원문", reason: options.unappliedReason ?? "PARSE_FAILED" }] });
    }
    if (url.endsWith("/candidates")) return route.fulfill({ json: { quality: "PARTIAL", applied_submissions: 2, total_submissions: options.emptyCandidates ? 4 : 3, unapplied_inputs: 2, candidates: options.emptyCandidates ? [] : [candidate] } });
    if (url.endsWith("/result")) return route.fulfill({ json: { candidate, confirmed_at: "2026-09-20T13:00:00Z" } });
    return route.fulfill({ json: {
      invite_code: code, purpose: "자연어 조건 모임", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
      search_start_date: "2026-09-21", search_end_date: "2026-09-28", search_range_source: "HOST_SPECIFIED",
      expected_participants: 3, submission_deadline: null, manual_only: false,
      collection_status: status === "COLLECTING" ? "COLLECTING" : "CLOSED", closure_reason: status === "COLLECTING" ? null : "EXPECTED_PARTICIPANTS",
      closed_at: status === "COLLECTING" ? null : "2026-09-20T12:00:00Z", public_status: status,
      viewer: { joined: true, display_name: "지수", role: options.role ?? "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
    } });
  });
  return { puts, unappliedRequests };
}

test("submits and reloads natural language, edits it, and has no input timetable", async ({ page }, testInfo) => {
  const api = await mockApi(page);
  await page.goto(`/rooms/${code}`);
  const input = page.getByRole("textbox");
  const submit = page.getByRole("button", { name: "조건 제출하기" });
  await expect(input).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);
  await expect(page.locator(".time-grid, .time-cell")).toHaveCount(0);
  await expect(page.getByText("자연어 또는 시간표", { exact: false })).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await input.fill(" \u00a0\ufeff ");
  await expect(submit).toBeDisabled();
  await input.fill("  월요일  저녁\n봉천역 근처  ");
  await page.screenshot({ path: testInfo.outputPath("natural-language.png"), fullPage: true });
  const box = await submit.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await submit.click();
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  expect(api.puts).toEqual([{ raw_text: "월요일  저녁\n봉천역 근처" }]);
  await page.reload();
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await expect(input).toHaveValue("월요일  저녁\n봉천역 근처");
  expect(api.puts).toHaveLength(1);
  await input.fill("목요일 저녁 비대면");
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await expect(page.getByText("저장된 입력 #2")).toBeVisible();
  expect(api.puts[1]).toEqual({ raw_text: "목요일 저녁 비대면" });
});

test("old server fixture accepts new web raw_text-only at 500 codepoints and old manual responses are unused", async ({ page }) => {
  const api = await mockApi(page, { oldServer: true, rawText: "화요일 저녁" });
  await page.goto(`/rooms/${code}`);
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("화요일 저녁");
  await expect(page.getByRole("grid")).toHaveCount(0);
  await input.fill(` \u00a0\ufeff${"😀".repeat(500)}\ufeff `);
  await expect(page.getByText("500/500")).toBeVisible();
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await expect(page.getByText("저장된 입력 #2")).toBeVisible();
  expect(api.puts).toEqual([{ raw_text: "😀".repeat(500) }]);
  await page.reload();
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await expect(input).toHaveValue("😀".repeat(500));
  await input.fill("😀".repeat(501));
  await expect(page.getByRole("button", { name: "수정 내용 저장" })).toBeDisabled();
  expect(api.puts).toHaveLength(1);
});

test("old server U001C trim difference is visible without silently changing new web validation", async ({ page }) => {
  const api = await mockApi(page, { oldServer: true });
  await page.goto(`/rooms/${code}`);
  const input = page.getByRole("textbox");
  await input.fill("\u001c");
  await expect(page.getByText("1/500")).toBeVisible();
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByText("가능한 시간·장소 조건을 자연어로 입력해 주세요.")).toBeVisible();
  await expect(page.getByText(/저장된 입력 #/)).toHaveCount(0);
  expect(api.puts).toEqual([{ raw_text: "\u001c" }]);
  await input.fill("\u001c월요일\u001c");
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await expect(input).toHaveValue("월요일");
});

test("accepts 500 emoji codepoints and rejects 501 without silently truncating", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto(`/rooms/${code}`);
  const input = page.getByRole("textbox");
  const submit = page.getByRole("button", { name: "조건 제출하기" });
  await input.fill("😀".repeat(501));
  await expect(input).toHaveValue("😀".repeat(501));
  await expect(page.getByText("501/500")).toBeVisible();
  await expect(submit).toBeDisabled();
  expect(api.puts).toHaveLength(0);
  await input.fill(` \u00a0${"😀".repeat(500)}\ufeff `);
  await expect(page.getByText("500/500")).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  expect(api.puts).toEqual([{ raw_text: "😀".repeat(500) }]);
});

test("loads legacy null without autosaving and supports deliberate natural-language replacement", async ({ page }) => {
  const api = await mockApi(page, { rawText: null });
  await page.goto(`/rooms/${code}`);
  await expect(page.getByText(/기존 시간표 입력은 보존/)).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("");
  await expect(page.getByRole("button", { name: "수정 내용 저장" })).toBeDisabled();
  await page.reload();
  await expect(page.getByText(/기존 시간표 입력은 보존/)).toBeVisible();
  expect(api.puts).toHaveLength(0);
  await page.getByRole("textbox").fill("화요일 저녁 가능");
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await expect(page.getByText("저장된 입력 #2")).toBeVisible();
  await expect(page.getByText(/기존 시간표 입력은 보존/)).toHaveCount(0);
  expect(api.puts).toEqual([{ raw_text: "화요일 저녁 가능" }]);
});

test("failed save keeps the edited text and existing revision", async ({ page }) => {
  const api = await mockApi(page, { rawText: "화요일 저녁", failSave: true });
  await page.goto(`/rooms/${code}`);
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  const input = page.getByRole("textbox");
  await expect(input).toHaveValue("화요일 저녁");
  await input.fill("목요일 저녁");
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await expect(page.getByText(/500자 이하로 입력/)).toBeVisible();
  await expect(input).toHaveValue("목요일 저녁");
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  expect(api.puts).toEqual([{ raw_text: "목요일 저녁" }]);
  await page.reload();
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await expect(input).toHaveValue("화요일 저녁");
});

for (const status of ["NO_MATCH", "READY_WITH_WARNINGS"]) {
  test(`${status} HOST can read nullable legacy reason`, async ({ page }) => {
    const api = await mockApi(page, { status, role: "HOST" });
    await page.goto(`/rooms/${code}`);
    await page.getByText(/반영되지 않은 입력.*확인/).click();
    await expect(page.getByText("기존 시간표만 제출되어 자연어 원문이 없어요.")).toBeVisible();
    await expect(page.getByText("기존 시간표 입력은 새 분석에서 지원하지 않아 반영되지 않았어요.")).toBeVisible();
    await expect(page.getByText("비공개 조건 원문")).toBeVisible();
    expect(api.unappliedRequests).toHaveLength(1);
    if (status === "READY_WITH_WARNINGS") {
      await expect(page.getByText(/일부 입력이 반영되지 않아/)).toBeVisible();
      await expect(page.locator(".time-options")).toContainText("오후 7:00");
      await expect(page.locator(".time-options")).toContainText("오후 09:00");
    }
  });

  test(`${status} MEMBER never requests or renders other participants' originals`, async ({ page }) => {
    const api = await mockApi(page, { status, unappliedReason: "UNSUPPORTED_CONDITIONAL_CONSTRAINT" });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: status === "NO_MATCH" ? "모두에게 맞는 후보를 찾지 못했어요" : "모두에게 가장 좋은 플랜이에요" })).toBeVisible();
    await expect(page.getByText(/반영되지 않은 입력.*확인/)).toHaveCount(0);
    await expect(page.getByText("비공개 조건 원문")).toHaveCount(0);
    expect(api.unappliedRequests).toHaveLength(0);
  });

  for (const [reason, message] of [
    ["UNSUPPORTED_CONDITIONAL_CONSTRAINT", "장소에 따라 시간이 달라지는 등 조건별로 시간과 장소를 연결한 입력은 현재 처리할 수 없어요. 이 입력은 후보 계산에 반영되지 않았어요."],
    ["AMBIGUOUS_TIME_CONSTRAINT", "가능한 시간이 명확하지 않아 이 입력을 후보 계산에 반영하지 못했어요. 날짜와 시작·종료 시간을 구체적으로 적어 주세요."],
  ]) test(`${status} HOST sees the explanation for ${reason}`, async ({ page }, testInfo) => {
    const api = await mockApi(page, { status, role: "HOST", unappliedReason: reason });
    await page.goto(`/rooms/${code}`);
    await page.getByText(/반영되지 않은 입력.*확인/).click();
    await expect(page.getByText(message!, { exact: true })).toBeVisible();
    await expect(page.getByText(reason!, { exact: true })).toHaveCount(0);
    await expect(page.getByText("비공개 조건 원문")).toBeVisible();
    await expect(page.getByText("기존 시간표 입력은 새 분석에서 지원하지 않아 반영되지 않았어요.")).toBeVisible();
    expect(api.unappliedRequests).toHaveLength(1);
    if (status === "READY_WITH_WARNINGS") await expect(page.getByText(/일부 입력이 반영되지 않아/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("conditional-reason.png"), fullPage: true });
  });

  test(`${status} MEMBER never fetches ambiguous time originals`, async ({ page }) => {
    const api = await mockApi(page, { status, unappliedReason: "AMBIGUOUS_TIME_CONSTRAINT" });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: status === "NO_MATCH" ? "모두에게 맞는 후보를 찾지 못했어요" : "모두에게 가장 좋은 플랜이에요" })).toBeVisible();
    await expect(page.locator(".unapplied")).toHaveCount(0);
    await expect(page.getByText("비공개 조건 원문")).toHaveCount(0);
    expect(api.unappliedRequests).toHaveLength(0);
  });

  test(`${status} does not invent a plan when a partial analysis has no candidates`, async ({ page }, testInfo) => {
    const api = await mockApi(page, { status, role: "HOST", unappliedReason: "AMBIGUOUS_TIME_CONSTRAINT", emptyCandidates: true });
    await page.goto(`/rooms/${code}`);
    await page.getByText(/반영되지 않은 입력.*확인/).click();
    await expect(page.getByText(/가능한 시간이 명확하지 않아/)).toBeVisible();
    await expect(page.locator(".candidate-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Plan .*로 확정/ })).toHaveCount(0);
    if (status === "READY_WITH_WARNINGS") await expect(page.getByText(/일부 입력이 반영되지 않아/)).toContainText("2/4개 반영");
    else await expect(page.getByRole("heading", { name: "모두에게 맞는 후보를 찾지 못했어요" })).toBeVisible();
    expect(api.puts).toHaveLength(0);
    expect(api.unappliedRequests).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath("partial-no-candidates.png"), fullPage: true });
  });
}

test("an unknown reason preserves the server code fallback", async ({ page }) => {
  await mockApi(page, { status: "NO_MATCH", role: "HOST", unappliedReason: "toString" });
  await page.goto(`/rooms/${code}`);
  await page.getByText(/반영되지 않은 입력.*확인/).click();
  await expect(page.locator(".unapplied small").filter({ hasText: /^toString$/ })).toBeVisible();
});

test("confirmed result keeps the read-only candidate time ranges", async ({ page }) => {
  await mockApi(page, { status: "CONFIRMED" });
  await page.goto(`/rooms/${code}`);
  await expect(page.getByText("최종 확정된 일정")).toBeVisible();
  await expect(page.locator(".time-options")).toContainText("오후 7:00");
  await expect(page.locator(".time-options")).toContainText("오후 09:00");
  await expect(page.getByRole("grid")).toHaveCount(0);
});
