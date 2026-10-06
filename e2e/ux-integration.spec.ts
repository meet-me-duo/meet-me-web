import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const candidate = {
  candidate_id: "11111111-1111-1111-1111-111111111111", plan_type: "A", meeting_mode: "IN_PERSON", rank: 1,
  attendance_count: 2, total_participants: 3, place: { display_name: "봉천역 근처", latitude: null, longitude: null }, summary: "화요일 저녁 후보",
  time_ranges: [{ start_at: "2099-01-06T10:00:00Z", end_at: "2099-01-06T12:00:00Z" }, { start_at: "2099-01-13T10:00:00Z", end_at: "2099-01-13T12:00:00Z" }],
};

for (const width of [1440, 320, 390]) test(`create, save, share, partial selection and member update at ${width}px`, async ({ page, context }, info) => {
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
  const origin = new URL(info.project.use.baseURL!).origin;
  const state = { status: "COLLECTING", created: [] as Record<string, unknown>[], writes: [] as Record<string, unknown>[], unexpected: [] as string[], errors: [] as string[], originals: [] as string[] };
  let stored: { raw_text: string; revision: number; locale: string; created_at: string; editable: boolean } | null = null;
  let holdSave = false;
  let releaseSave = () => {};
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  const room = (role: string) => ({
    invite_code: code, purpose: "통합 흐름 검증", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul",
    search_start_date: "2099-01-01", search_end_date: "2099-01-15", search_range_source: "DEFAULTED",
    expected_participants: 4, submission_deadline: "2099-12-31T09:30:00.000Z", manual_only: false,
    collection_status: state.status === "COLLECTING" ? "COLLECTING" : "CLOSED", public_status: state.status,
    closure_reason: state.status === "COLLECTING" ? null : "HOST_MANUAL", closed_at: state.status === "COLLECTING" ? null : "2099-01-01T09:00:00Z",
    viewer: { joined: true, role, display_name: role === "HOST" ? "주최자" : "참여자" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  });
  async function fixture(target: Page, role: string) {
    target.on("pageerror", error => state.errors.push(error.message));
    await target.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { state.unexpected.push(request.url()); return route.abort(); }
      if (!url.pathname.startsWith("/api/")) return request.method() === "GET" ? route.continue() : route.abort();
      const suffix = url.pathname.replace(`/api/rooms/${code}`, "");
      if (url.pathname === "/api/rooms" && request.method() === "POST" && role === "HOST") {
        state.created.push(request.postDataJSON()); return route.fulfill({ status: 201, json: room(role) });
      }
      if (suffix === "" && request.method() === "GET") return route.fulfill({ json: room(role) });
      if (suffix === "/submission") {
        if (request.method() === "PUT" && role === "HOST") {
          const body = request.postDataJSON(); state.writes.push(body);
          if (holdSave) await saveGate;
          stored = { raw_text: body.raw_text, revision: (stored?.revision ?? 0) + 1, locale: "ko-KR", created_at: "2099-01-01T09:00:00Z", editable: true };
        }
        return stored ? route.fulfill({ json: stored }) : route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
      }
      if (suffix === "/close" && request.method() === "POST" && role === "HOST") { state.status = "READY_WITH_WARNINGS"; return route.fulfill({ json: room(role) }); }
      if (suffix === "/candidates" && request.method() === "GET") return route.fulfill({ json: { quality: "PARTIAL", applied_submissions: 2, total_submissions: 3, unapplied_inputs: 1, candidates: [candidate] } });
      if (suffix === "/candidates/unapplied-inputs" && role === "HOST" && request.method() === "GET") {
        state.originals.push(role); return route.fulfill({ json: [{ participant_display_name: "미반영 참여자", raw_text: "가상 미반영 원문", reason: "AMBIGUOUS_TIME_CONSTRAINT" }] });
      }
      if (suffix === `/candidates/${candidate.candidate_id}/confirmation` && request.method() === "POST" && role === "HOST") {
        state.status = "CONFIRMED"; return route.fulfill({ json: { candidate, confirmed_at: "2099-01-01T09:00:00Z" } });
      }
      if (suffix === "/result" && request.method() === "GET") return route.fulfill({ json: { candidate, confirmed_at: "2099-01-01T09:00:00Z" } });
      state.unexpected.push(`${role} ${request.method()} ${url.pathname}`); return route.abort();
    });
  }
  await fixture(page, "HOST");
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} }, configurable: true }); });
  await page.goto("/create");
  await page.getByLabel("주최자 이름").fill("주최자");
  await page.getByLabel("모임 목적 / 이름").fill("통합 흐름 검증");
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("checkbox", { name: /정해진 시간이 되면/ }).check();
  await page.getByLabel("제출 마감 (한국 시간)").fill("2099-12-31T18:30");
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page).toHaveURL(`/rooms/${code}`);
  expect(state.created[0]).toMatchObject({ expected_participants: 4, submission_deadline: "2099-12-31T09:30:00.000Z", manual_only: false, search_start_date: null, search_end_date: null });
  await expect(page.getByText("목표 4명 제출 시", { exact: true })).toBeVisible();
  await expect(page.getByText("자동 마감 시간", { exact: true })).toBeVisible();
  await expect(page.getByText(/먼저 충족되는 조건/)).toBeVisible();
  await expect(page.getByText(/반영하지 못한 원문은 주최자에게 공개/)).toBeVisible();
  await page.getByRole("textbox").fill("화요일 저녁");
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
  await page.locator(".submission-complete").getByRole("button", { name: "초대 링크 복사" }).click();
  await expect(page.locator(".submission-complete [role=status]")).toHaveText("링크를 복사했어요.");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`host-complete-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "내 조건 수정" }).click();
  await page.getByRole("textbox").fill("목요일 저녁"); holdSave = true;
  await page.getByRole("button", { name: "수정 내용 저장" }).click();
  await expect.poll(() => state.writes.length).toBe(2);
  await page.getByRole("textbox").fill("금요일 저녁"); releaseSave();
  await expect(page.getByText("저장된 입력 #2")).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveValue("금요일 저녁");
  await expect(page.getByText("수정한 내용이 아직 저장되지 않았어요.")).toBeVisible();
  await page.getByRole("button", { name: "수정 취소" }).click();
  await expect(page.locator(".submitted-text")).toHaveText("목요일 저녁");
  await page.getByRole("button", { name: "입력 마감하기" }).click();
  await expect(page.getByRole("heading", { name: "일부 조건으로 만든 후보 플랜이에요" })).toBeVisible();
  const member = await context.newPage();
  await member.setViewportSize({ width, height: 844 }); await member.clock.install(); await fixture(member, "MEMBER");
  await member.goto(`/rooms/${code}`);
  await expect(member.locator(".candidate-card")).toBeVisible();
  await expect(member.getByRole("button", { name: "Plan A 선택" })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Plan A 선택" }).click();
  await expect(page.getByRole("heading", { name: "주최자가 선택한 플랜이에요" })).toBeVisible();
  await member.clock.runFor(5_100);
  await expect(member.getByRole("heading", { name: "주최자가 선택한 플랜이에요" })).toBeVisible();
  await expect(member.locator(".time-options span")).toHaveCount(2);
  for (const target of [page, member]) expect(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await member.evaluate(() => window.scrollTo(0, 0));
  await member.screenshot({ path: info.outputPath(`member-selected-${width}.png`), fullPage: true });
  expect(state.writes).toEqual([{ raw_text: "화요일 저녁" }, { raw_text: "목요일 저녁" }]);
  expect(state.originals).toEqual(["HOST"]); expect(state.unexpected).toEqual([]); expect(state.errors).toEqual([]);
  await member.close();
});
