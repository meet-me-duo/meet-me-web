import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const candidate = {
  candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", meeting_mode: "IN_PERSON", rank: 1,
  attendance_count: 2, total_participants: 3, place: { display_name: "봉천역 근처", latitude: null, longitude: null }, summary: "화요일 저녁 후보",
  time_ranges: [{ start_at: "2026-10-06T10:00:00Z", end_at: "2026-10-06T12:00:00Z" }, { start_at: "2026-10-13T10:00:00Z", end_at: "2026-10-13T12:00:00Z" }],
};

async function fixture(page: Page, options: { status?: string; role?: string; partial?: boolean; count?: number; failSave?: boolean; failRefresh?: boolean; holdSave?: boolean } = {}) {
  let status = options.status ?? "COLLECTING";
  let stored = { revision: 1, raw_text: "화요일 저녁", locale: "ko-KR", created_at: "2026-10-05T08:00:00Z", editable: true };
  let failSave = options.failSave ?? false;
  let failRefresh = false;
  const writes: unknown[] = [];
  const confirmations: string[] = [];
  const originals: string[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  let releaseSave = () => {};
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") { unexpected.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const suffix = url.pathname.replace(`/api/rooms/${code}`, "");
    if (suffix === "/submission") {
      if (request.method() === "PUT") {
        writes.push(request.postDataJSON());
        if (failSave) { failSave = false; return route.fulfill({ status: 400, json: { code: "SUBMISSION_TEXT_TOO_LONG" } }); }
        if (options.holdSave) await saveGate;
        stored = { ...stored, revision: stored.revision + 1, raw_text: request.postDataJSON().raw_text };
        failRefresh = options.failRefresh ?? false;
      }
      return route.fulfill({ json: stored });
    }
    if (suffix === "/candidates") return route.fulfill({ json: { quality: options.partial ? "PARTIAL" : "COMPLETE", applied_submissions: options.partial ? 2 : 3, total_submissions: 3, unapplied_inputs: options.partial ? 1 : 0, candidates: Array.from({ length: options.count ?? 1 }, (_, index) => ({ ...candidate, candidate_id: `${index + 1}1111111-1111-1111-1111-111111111111`, plan_type: index ? "B" : "A", rank: index + 1 })) } });
    if (suffix === "/candidates/unapplied-inputs") { originals.push(url.pathname); return route.fulfill({ json: [{ participant_display_name: "다른 참여자", raw_text: "미반영 원문", reason: "AMBIGUOUS_TIME_CONSTRAINT" }] }); }
    if (suffix.endsWith("/confirmation")) {
      confirmations.push(suffix);
      status = "CONFIRMED";
      return route.fulfill({ json: { candidate, confirmed_at: "2026-10-05T09:00:00Z" } });
    }
    if (suffix === "/result") return route.fulfill({ json: { candidate, confirmed_at: "2026-10-05T09:00:00Z" } });
    if (suffix === "") {
      if (failRefresh) { failRefresh = false; return route.fulfill({ status: 503, json: { code: "SERVICE_UNAVAILABLE" } }); }
      return route.fulfill({ json: { invite_code: code, purpose: "플랜과 저장 상태 검증", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-05", search_end_date: "2026-10-19", search_range_source: "DEFAULTED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: status === "COLLECTING" ? "COLLECTING" : "CLOSED", closure_reason: status === "COLLECTING" ? null : "EXPECTED_PARTICIPANTS", closed_at: status === "COLLECTING" ? null : "2026-10-05T08:00:00Z", public_status: status, viewer: { joined: true, display_name: "검증 참여자", role: options.role ?? "MEMBER" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT" } });
    }
    unexpected.push(`${request.method()} ${url.pathname}`);
    return route.abort();
  });
  return { writes, confirmations, originals, unexpected, errors, releaseSave };
}

for (const width of [1440, 320, 390]) test.describe(`accuracy at ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } });

  test("saved, edited, failed, retried and reloaded states match the persisted input", async ({ page }, testInfo) => {
    const api = await fixture(page, { failSave: true });
    await page.goto(`/rooms/${code}`);
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    const input = page.getByRole("textbox");
    await expect(input).toHaveValue("화요일 저녁");
    await expect(page.getByText("조건이 안전하게 저장됐어요.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "수정 내용 저장" })).toBeDisabled();
    await expect(page.getByText(/반영하지 못한 원문은 주최자에게 공개/)).toBeVisible();
    await input.fill("목요일 저녁");
    await expect(page.getByText("조건이 안전하게 저장됐어요.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("unsaved.png"), fullPage: true });
    await page.getByRole("button", { name: "수정 내용 저장" }).click();
    await expect(page.getByText(/500자 이하로 입력/)).toBeVisible();
    await expect(input).toHaveValue("목요일 저녁");
    await expect(page.getByText("저장된 입력 #1")).toBeVisible();
    await page.getByRole("button", { name: "수정 내용 저장" }).click();
    await expect(page.getByText("저장된 입력 #2")).toBeVisible();
    await expect(page.getByText("조건이 안전하게 저장됐어요.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    await input.fill("금요일 저녁");
    await expect(page.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    await expect(input).toHaveValue("목요일 저녁");
    expect(api.writes).toEqual([{ raw_text: "목요일 저녁" }, { raw_text: "목요일 저녁" }]);
    expect(api.unexpected).toEqual([]); expect(api.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("a failed room refresh cannot turn the successful PUT into a save failure", async ({ page }) => {
    const api = await fixture(page, { failRefresh: true });
    await page.goto(`/rooms/${code}`);
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("화요일 저녁");
    await page.getByRole("textbox").fill("목요일 저녁");
    await page.getByRole("button", { name: "수정 내용 저장" }).click();
    await expect(page.getByText("조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.")).toBeVisible();
    await expect(page.getByText("조건이 안전하게 저장됐어요.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "진행 상태 다시 확인" }).click();
    await expect(page.getByText("조건은 저장됐지만 모임 진행 상태를 갱신하지 못했어요.")).toHaveCount(0);
    expect(api.writes).toEqual([{ raw_text: "목요일 저녁" }]);
    expect(api.unexpected).toEqual([]); expect(api.errors).toEqual([]);
  });

  test("editing during an in-flight save is preserved and remains unsaved", async ({ page }) => {
    const api = await fixture(page, { holdSave: true });
    await page.goto(`/rooms/${code}`);
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    const input = page.getByRole("textbox");
    await expect(input).toHaveValue("화요일 저녁");
    await input.fill("목요일 저녁");
    await page.getByRole("button", { name: "수정 내용 저장" }).click();
    await expect.poll(() => api.writes.length).toBe(1);
    await input.fill("금요일 저녁");
    api.releaseSave();
    await expect(page.getByText("저장된 입력 #2")).toBeVisible();
    await expect(input).toHaveValue("금요일 저녁");
    await expect(page.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeVisible();
    await expect(page.getByText("조건이 안전하게 저장됐어요.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "수정 취소" })).toBeEnabled();
    await input.fill("목요일 저녁");
    await expect(input).toBeVisible();
    await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toHaveCount(0);
    await page.getByRole("button", { name: "수정 취소" }).click();
    await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    await expect(input).toHaveValue("목요일 저녁");
    expect(api.unexpected).toEqual([]); expect(api.errors).toEqual([]);
  });

  test("a partial plan preserves all times and is selectable after reviewing the host originals", async ({ page }, testInfo) => {
    const api = await fixture(page, { status: "READY_WITH_WARNINGS", role: "HOST", partial: true });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: "일부 조건으로 만든 후보 플랜이에요" })).toBeVisible();
    const card = page.locator(".candidate-card");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".time-options span")).toHaveCount(2);
    await expect(card).toContainText("2/3명 참석 가능");
    await expect(card).toContainText("후보 지역 · 봉천역 근처");
    await page.getByText("반영되지 않은 입력 1개 확인").click();
    await expect(page.getByText("미반영 원문", { exact: true })).toBeVisible();
    await expect(card.locator(".candidate-warning")).toContainText("2/3개 입력 반영");
    const warning = (await card.locator(".candidate-warning").boundingBox())!;
    const select = page.getByRole("button", { name: "Plan A 선택" });
    const action = (await select.boundingBox())!;
    expect(action.y - warning.y - warning.height).toBeLessThan(40);
    await page.screenshot({ path: testInfo.outputPath("partial-review.png"), fullPage: true });
    page.once("dialog", dialog => { expect(dialog.message()).toContain("실제 모임 날짜·시간은 따로 정해 공지"); void dialog.accept(); });
    await select.click();
    await expect(page.getByRole("heading", { name: "주최자가 선택한 플랜이에요" })).toBeVisible();
    await expect(page.locator(".time-options span")).toHaveCount(2);
    await expect(page.getByText("선택한 플랜", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("selected-plan.png"), fullPage: true });
    await page.reload();
    await expect(page.getByRole("heading", { name: "주최자가 선택한 플랜이에요" })).toBeVisible();
    expect(api.confirmations).toHaveLength(1); expect(api.originals).toHaveLength(1);
    expect(api.unexpected).toEqual([]); expect(api.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("empty partial results do not suggest selecting a plan or expose originals to members", async ({ page }, testInfo) => {
    const api = await fixture(page, { status: "READY_WITH_WARNINGS", partial: true, count: 0 });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: "선택할 수 있는 후보가 없어요" })).toBeVisible();
    await expect(page.getByText(/플랜 하나를 선택|플랜을 선택하면/)).toHaveCount(0);
    await expect(page.locator(".candidate-card, .unapplied")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Plan .* 선택/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("empty-partial.png"), fullPage: true });
    expect(api.originals).toEqual([]); expect(api.confirmations).toEqual([]);
    expect(api.unexpected).toEqual([]); expect(api.errors).toEqual([]);
  });

  test("one or several server candidates remain visible without inventing a third plan", async ({ page }) => {
    const api = await fixture(page, { status: "READY", count: 2 });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: "함께할 수 있는 후보 플랜이에요" })).toBeVisible();
    await expect(page.locator(".candidate-card")).toHaveCount(2);
    await expect(page.locator(".time-options span")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /Plan .* 선택/ })).toHaveCount(0);
    expect(api.originals).toEqual([]); expect(api.confirmations).toEqual([]);
    expect(api.unexpected).toEqual([]); expect(api.errors).toEqual([]);
  });
});
