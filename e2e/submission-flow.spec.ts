import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const localOrigin = () => new URL(test.info().project.use.baseURL!).origin;
const candidate = {
  candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", meeting_mode: "REMOTE", rank: 1,
  attendance_count: 2, total_participants: 3,
  time_ranges: [{ start_at: "2026-09-22T10:00:00Z", end_at: "2026-09-22T12:00:00Z" }], place: null, summary: "화요일 저녁 비대면 일정",
};

async function fixture(page: Page, role: "HOST" | "MEMBER", initial = "COLLECTING", saved = false, closure = "both") {
  const state = { status: initial, pendingSave: null as Promise<void> | null, roomGets: 0, failGet: false, failSave: false, failClose: false, writes: [] as { path: string; body: unknown }[], unexpected: [] as string[] };
  let stored = saved ? { revision: 1, raw_text: "화요일 저녁", locale: "ko-KR", created_at: "2026-09-20T12:00:00Z", editable: true } : null;
  const room = () => ({
    invite_code: code, purpose: "제출 후 다음 행동 확인", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
    search_start_date: "2026-09-21", search_end_date: "2026-09-28", search_range_source: "DEFAULTED",
    expected_participants: ["both", "count"].includes(closure) ? 4 : null,
    submission_deadline: ["both", "time"].includes(closure) ? "2026-09-25T10:00:00Z" : null,
    manual_only: closure === "manual", collection_status: state.status === "COLLECTING" ? "COLLECTING" : "CLOSED",
    closure_reason: state.status === "COLLECTING" ? null : "HOST_MANUAL", closed_at: state.status === "COLLECTING" ? null : "2026-09-20T12:00:00Z",
    public_status: state.status, viewer: { joined: true, display_name: "지수", role }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== localOrigin()) { state.unexpected.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const path = url.pathname;
    if (request.method() !== "GET") state.writes.push({ path, body: request.postDataJSON() });
    if (path === `/api/rooms/${code}/submission`) {
      if (request.method() === "PUT") {
        if (state.failSave) return route.fulfill({ status: 409, json: { code: "ROOM_CLOSED" } });
        if (state.pendingSave) await state.pendingSave;
        stored = { revision: (stored?.revision ?? 0) + 1, raw_text: request.postDataJSON().raw_text, locale: "ko-KR", created_at: "2026-09-20T13:00:00Z", editable: true };
      }
      return stored ? route.fulfill({ json: stored }) : route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    }
    if (path === `/api/rooms/${code}` && request.method() === "GET") {
      state.roomGets++;
      return state.failGet ? route.fulfill({ status: 503, json: { detail: "일시적인 조회 실패" } }) : route.fulfill({ json: room() });
    }
    if (path === `/api/rooms/${code}/candidates` && request.method() === "GET") return route.fulfill({ json: { quality: initial === "READY_WITH_WARNINGS" ? "PARTIAL" : "COMPLETE", applied_submissions: 2, total_submissions: 3, unapplied_inputs: 1, candidates: [candidate] } });
    if (path === `/api/rooms/${code}/result` && request.method() === "GET") return route.fulfill({ json: { candidate, confirmed_at: "2026-09-20T13:00:00Z" } });
    if (path.endsWith("/unapplied-inputs") && role === "HOST" && request.method() === "GET") return route.fulfill({ json: [{ participant_display_name: "참여자", raw_text: "미반영 원문", reason: "PARSE_FAILED" }] });
    if (path.endsWith("/confirmation") && role === "HOST" && request.method() === "POST") { state.status = "CONFIRMED"; return route.fulfill({ json: { candidate, confirmed_at: "2026-09-20T13:00:00Z" } }); }
    if (path === `/api/rooms/${code}/close` && role === "HOST" && request.method() === "POST") {
      if (state.failClose) return route.fulfill({ status: 503, json: { detail: "마감 처리 실패" } });
      if (!request.postDataJSON().confirm_early) return route.fulfill({ status: 409, json: { code: "EARLY_CLOSE_CONFIRMATION_REQUIRED", submitted_participants: 2, expected_participants: 4, submission_deadline: "2026-09-25T10:00:00Z" } });
      state.status = "ANALYZING"; return route.fulfill({ json: room() });
    }
    state.unexpected.push(`${request.method()} ${path}`); return route.abort();
  });
  return state;
}

async function checkLayout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await page.locator(".submission-complete button").all()) {
    const box = await button.boundingBox();
    expect(await button.evaluate(element => Number.parseFloat(getComputedStyle(element).minHeight))).toBeGreaterThanOrEqual(44);
    // Normalize Chromium's fractional scroll geometry without lowering the 44px target.
    expect(Math.round(box!.height * 1_000) / 1_000).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
}

for (const width of [1440, 320, 390]) {
  test.describe(`submission flow ${width}`, () => {
    test.use({ viewport: { width, height: width === 1440 ? 900 : 844 } });

    for (const role of ["HOST", "MEMBER"] as const) {
      test(`${role} submits, edits twice, cancels, reloads and returns through history`, async ({ page }, info) => {
        const state = await fixture(page, role);
        await page.goto(`/rooms/${code}`);
        await page.getByRole("textbox").fill("화요일 저녁");
        await page.getByRole("button", { name: "조건 제출하기" }).click();
        await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
        await expect(page.getByRole("textbox")).toHaveCount(0);
        await expect(page.getByText(role === "HOST" ? "초대 링크를 공유해 주세요" : "입력 마감을 기다려 주세요")).toBeVisible();
        await expect(page.getByText("목표 4명 제출 시", { exact: true })).toBeVisible();
        await expect(page.getByText(/오후 7:00/)).toBeVisible();
        await expect(page.getByText(/먼저 충족되는 조건/)).toBeVisible();
        await expect(page.getByRole("button", { name: "입력 마감하기" })).toHaveCount(role === "HOST" ? 1 : 0);
        await checkLayout(page);
        await page.screenshot({ path: info.outputPath(`${role}-completed.png`), fullPage: true });
        for (const text of ["목요일 저녁", "금요일 비대면"]) {
          await page.getByRole("button", { name: "내 조건 수정" }).click();
          await page.getByRole("textbox").fill(text);
          await page.getByRole("button", { name: "수정 내용 저장" }).click();
          await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
          await expect(page.locator(".submitted-text")).toHaveText(text);
        }
        await page.getByRole("button", { name: "내 조건 수정" }).click();
        await page.getByRole("textbox").fill("저장하지 않는 수정");
        await page.getByRole("button", { name: "수정 취소" }).click();
        await expect(page.locator(".submitted-text")).toHaveText("금요일 비대면");
        await page.reload();
        await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
        await page.getByRole("link", { name: "Meet me 홈" }).click();
        await page.goBack();
        await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
        expect(state.writes.map(item => item.body)).toEqual([{ raw_text: "화요일 저녁" }, { raw_text: "목요일 저녁" }, { raw_text: "금요일 비대면" }]);
        expect(state.unexpected).toEqual([]);
      });

      for (const status of ["READY", "READY_WITH_WARNINGS"]) {
        test(`${role} ${status} updates to CONFIRMED without reload and stops polling`, async ({ page }, info) => {
          await page.clock.install();
          const state = await fixture(page, role, status);
          await page.goto(`/rooms/${code}`);
          await expect(page.locator(".candidate-card")).toBeVisible();
          await expect(page.getByRole("button", { name: /^Plan [ABC](?:로 확정| 선택)$/ })).toHaveCount(role === "HOST" ? 1 : 0);
          const gets = state.roomGets;
          state.status = "CONFIRMED";
          await page.clock.runFor(5_100);
          await expect(page.locator(".result-copy")).toBeVisible();
          expect(state.roomGets).toBeGreaterThan(gets);
          const confirmedGets = state.roomGets;
          await page.clock.runFor(10_100);
          expect(state.roomGets).toBe(confirmedGets);
          await expect(page.locator(".candidate-card button")).toHaveCount(0);
          await checkLayout(page);
          await page.screenshot({ path: info.outputPath(`${role}-${status}-confirmed.png`), fullPage: true });
          expect(state.writes).toEqual([]);
          expect(state.unexpected).toEqual([]);
        });
      }
    }

    test("editing during save stays visible until explicit cancel or a later save", async ({ page }) => {
      const state = await fixture(page, "MEMBER", "COLLECTING", true);
      let release = () => {};
      state.pendingSave = new Promise<void>(resolve => { release = resolve; });
      await page.goto(`/rooms/${code}`);
      await page.getByRole("button", { name: "내 조건 수정" }).click();
      const input = page.getByRole("textbox");
      await input.fill("목요일 저녁");
      await page.getByRole("button", { name: "수정 내용 저장" }).click();
      await expect.poll(() => state.writes.length).toBe(1);
      await expect(input).toBeEnabled();
      await expect(page.getByRole("button", { name: "수정 취소" })).toBeDisabled();
      await input.fill("금요일 저녁");
      release(); state.pendingSave = null;
      await expect(page.getByText("저장된 입력 #2")).toBeVisible();
      await expect(input).toHaveValue("금요일 저녁");
      await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toHaveCount(0);
      await input.fill("목요일 저녁");
      await expect(input).toBeVisible();
      await page.getByRole("button", { name: "수정 취소" }).click();
      await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
      await expect(page.locator(".submitted-text")).toHaveText("목요일 저녁");
      await page.getByRole("button", { name: "내 조건 수정" }).click();
      await input.fill("토요일 저녁");
      await page.getByRole("button", { name: "수정 내용 저장" }).click();
      await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
      await expect(page.locator(".submitted-text")).toHaveText("토요일 저녁");
      expect(state.writes.map(item => item.body)).toEqual([{ raw_text: "목요일 저녁" }, { raw_text: "토요일 저녁" }]);
      expect(state.unexpected).toEqual([]);
    });

    test("poll failure preserves editing and ready content, then recovers", async ({ page }) => {
      await page.clock.install();
      const state = await fixture(page, "MEMBER", "COLLECTING", true);
      await page.goto(`/rooms/${code}`);
      await page.getByRole("button", { name: "내 조건 수정" }).click();
      await page.getByRole("textbox").fill("아직 저장하지 않은 조건");
      state.failGet = true;
      await page.clock.runFor(5_100);
      await expect(page.getByText(/모임 상태를 갱신하지 못했어요/)).toBeVisible();
      await expect(page.getByRole("textbox")).toHaveValue("아직 저장하지 않은 조건");
      state.failGet = false; state.status = "READY";
      await page.getByRole("button", { name: "진행 상태 다시 확인" }).click();
      await expect(page.locator(".candidate-card")).toBeVisible();
      state.failGet = true;
      await page.clock.runFor(5_100);
      await expect(page.getByText(/모임 상태를 갱신하지 못했어요/)).toBeVisible();
      await expect(page.locator(".candidate-card")).toBeVisible();
      state.failGet = false; state.status = "CONFIRMED";
      await page.getByRole("button", { name: "진행 상태 다시 확인" }).click();
      await expect(page.locator(".result-copy")).toBeVisible();
      expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]);
    });

    test("share and result copy report success and safely offer manual copy on failure", async ({ page }) => {
      await fixture(page, "HOST", "COLLECTING", true);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedLink: string }).copiedLink = text; } } });
      });
      await page.goto(`/rooms/${code}?tracking=remove#private`);
      await page.locator(".submission-complete").getByRole("button", { name: "초대 링크 복사" }).click();
      await expect(page.locator(".submission-complete [role=status]")).toHaveText("링크를 복사했어요.");
      expect(await page.evaluate(() => (window as unknown as { copiedLink: string }).copiedLink)).toBe(`${localOrigin()}/rooms/${code}`);
      await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("denied"); }; });
      await page.getByRole("button", { name: "초대 링크 복사" }).first().click();
      await expect(page.getByLabel("직접 복사할 링크")).toHaveValue(`${localOrigin()}/rooms/${code}`);
      await expect(page.locator(".room-header .copy-feedback")).toContainText("자동으로 복사하지 못했어요");
      await fixture(page, "MEMBER", "CONFIRMED");
      await page.reload();
      await page.locator(".result-copy button").click();
      await expect(page.locator(".result-copy .copy-feedback")).toHaveText("링크를 복사했어요.");
      await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("denied"); }; });
      await page.locator(".result-copy button").click();
      await expect(page.locator(".result-copy .copy-feedback")).toContainText("자동으로 복사하지 못했어요");
      await expect(page.locator(".result-copy input")).toHaveValue(`${localOrigin()}/rooms/${code}`);
    });

    test("close errors and early close use actual response counts, member cannot close", async ({ page }) => {
      const state = await fixture(page, "HOST", "COLLECTING", true);
      await page.goto(`/rooms/${code}`);
      state.failClose = true;
      await page.getByRole("button", { name: "입력 마감하기" }).click();
      await expect(page.getByText("마감 처리 실패")).toBeVisible();
      await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
      state.failClose = false;
      const cancelled = page.waitForEvent("dialog").then(async dialog => {
        expect(dialog.message()).toContain("2명 제출 / 목표 4명");
        expect(dialog.message()).toContain("마감:");
        await dialog.dismiss();
      });
      await Promise.all([cancelled, page.getByRole("button", { name: "입력 마감하기" }).click()]);
      await expect(page.getByRole("button", { name: "입력 마감하기" })).toBeEnabled();
      expect(state.status).toBe("COLLECTING");
      const accepted = page.waitForEvent("dialog").then(dialog => dialog.accept());
      await Promise.all([accepted, page.getByRole("button", { name: "입력 마감하기" }).click()]);
      await expect(page.getByRole("heading", { name: "모두의 조건을 분석하고 있어요" })).toBeVisible();
      expect(state.writes.at(-1)?.body).toEqual({ confirm_early: true });
      expect(state.unexpected).toEqual([]);
    });
  });
}

for (const closure of ["count", "time", "manual"]) {
  test(`closure settings ${closure} remain accurate after reload`, async ({ page }) => {
    const state = await fixture(page, "MEMBER", "COLLECTING", true, closure);
    await page.goto(`/rooms/${code}`); await page.reload();
    await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
    await expect(page.getByText("목표 4명 제출 시", { exact: true })).toHaveCount(closure === "count" ? 1 : 0);
    await expect(page.getByText("자동 마감 시간", { exact: true })).toHaveCount(closure === "time" ? 1 : 0);
    await expect(page.getByText("주최자 직접 마감", { exact: true })).toHaveCount(closure === "manual" ? 1 : 0);
    expect(state.writes).toEqual([]); expect(state.unexpected).toEqual([]);
  });
}
