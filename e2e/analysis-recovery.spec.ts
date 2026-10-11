// Draft placement: e2e/analysis-recovery.spec.ts. Not executed.
import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";
const a0 = "11111111-1111-4111-8111-111111111111";
const a1 = "22222222-2222-4222-8222-222222222222";
const c1 = "33333333-3333-4333-8333-333333333333";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const original = "음~ 평일은 7시부터 9시까지 돼요\n이번주는 목요일만 8시부터 가능합니다\n주말에는 2시부터 7시까지 되어요";
const updated = "평일 저녁 7시부터 9시까지, 이번 주 목요일은 저녁 8시부터 9시까지, 주말 오후 2시부터 7시까지";

async function fixture(page: Page, baseURL: string, options: { role?: "HOST" | "MEMBER"; open?: boolean; legacy?: boolean; joined?: boolean } = {}) {
  const origin = new URL(baseURL).origin;
  const root = `/api/rooms/${code}`;
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  const role = options.role ?? "HOST";
  const joined = options.joined ?? true;
  let text = original; let revision = 7; let stamp = 10; let generation = options.open ? 1 : 0;
  let open = options.open ?? false; let status = open ? "COLLECTING" : "NO_MATCH"; let analysis = a0; let queued = false;
  const snapshot = () => {
    const room = {
      invite_code: code, purpose: "합성 같은 모임 복구", meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul",
      search_start_date: "2026-10-07", search_end_date: "2026-10-12", search_range_source: "HOST_SPECIFIED",
      expected_participants: 2, submission_deadline: "2026-10-01T00:00:00Z", manual_only: false,
      collection_status: "CLOSED", closure_reason: "EXPECTED_PARTICIPANTS", closed_at: "2026-10-01T00:00:00Z",
      public_status: status, viewer: { joined, display_name: joined ? "합성 참여자" : null, role: joined ? role : null }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
      state_version: stamp, revision_generation: generation, revision_round: open ? { id: c1, generation, status: "OPEN" } : null, analysis_id: analysis,
      capabilities: { can_edit_own_submission: joined && open, can_open_revision: joined && role === "HOST" && status === "NO_MATCH", can_analyze_revision: joined && role === "HOST" && open, can_confirm: joined && role === "HOST" && status === "READY", can_force_reparse: joined && role === "HOST" && open }, remaining_correction_analyses: 3,
    };
    const additions = new Set(["state_version", "revision_generation", "revision_round", "analysis_id", "capabilities", "remaining_correction_analyses"]);
    return options.legacy ? Object.fromEntries(Object.entries(room).filter(([key]) => !additions.has(key))) : room;
  };
  const own = () => ({ raw_text: text, revision, editable: open, locale: "ko-KR", created_at: "2026-10-07T08:00:00Z" });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(); const url = new URL(request.url()); const method = request.method();
    if (url.origin !== origin) { unexpected.push(method + " " + request.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) {
      if (method === "GET") return route.continue();
      unexpected.push(method + " " + url.pathname); return route.abort();
    }
    if (method === "GET" && url.pathname === root) {
      if (queued) { queued = false; status = "READY"; stamp++; }
      return route.fulfill({ json: snapshot() });
    }
    if (method === "GET" && url.pathname === root + "/submission") return route.fulfill({ json: own() });
    if (method === "GET" && url.pathname === root + "/candidates/unapplied-inputs" && role === "HOST") return route.fulfill({ json: [] });
    if (method === "GET" && url.pathname === root + "/candidates") return route.fulfill({ json: {
      analysis_id: analysis, quality: "COMPLETE", applied_submissions: 2, total_submissions: 2, unapplied_inputs: 0,
      candidates: [{ candidate_id: a1, plan_type: "A", meeting_mode: "REMOTE", rank: 1, attendance_count: 2, total_participants: 2, place: null, summary: "새 분석의 합성 후보", time_ranges: [{ start_at: "2026-10-08T11:00:00Z", end_at: "2026-10-08T12:00:00Z" }] }],
    } });
    if (["POST", "PUT"].includes(method)) {
      const body = request.postDataJSON() as Record<string, unknown>; writes.push({ path: url.pathname, body });
      if (method === "POST" && url.pathname === root + "/reopen" && role === "HOST" && !open) {
        expect(body).toEqual({ request_id: expect.stringMatching(uuid), source_analysis_id: a0, expected_generation: 0 });
        generation++; stamp++; open = true; status = "COLLECTING";
        return route.fulfill({ json: { room: snapshot(), round: { id: c1, generation, status: "OPEN" } } });
      }
      if (method === "PUT" && url.pathname === root + "/submission" && open && joined) {
        expect(body.revision_round_id).toBe(c1); expect(body.expected_revision).toBe(revision);
        text = String(body.raw_text); revision++;
        return route.fulfill({ json: own() });
      }
      if (method === "POST" && url.pathname === root + "/analysis" && role === "HOST" && open) {
        expect(body).toEqual({ revision_round_id: c1, request_id: expect.stringMatching(uuid), force_reparse: false });
        open = false; status = "ANALYZING"; analysis = a1; stamp++; queued = true;
        return route.fulfill({ status: 202, json: { outcome: "QUEUED", analysis_id: a1, revision_round_id: c1, room: snapshot() } });
      }
    }
    unexpected.push(method + " " + url.pathname); return route.abort();
  });
  return { writes, unexpected, errors };
}

for (const width of [1440, 390, 320]) test.describe(`same-room correction at ${width}px`, () => {
  test.use({ viewport: { width, height: 844 } });

  test("HOST opens, explicitly saves, analyzes and receives a new result without replacing the room", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!);
    await page.goto(`/rooms/${code}`);
    await page.getByRole("button", { name: "조건 수정 열기" }).click();
    await expect(page.getByRole("button", { name: "수정한 조건으로 다시 분석" })).toBeVisible();
    expect(mock.writes).toHaveLength(1);
    await expect(page.getByRole("button", { name: "입력 마감하기" })).toHaveCount(0);
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    await expect(page.getByRole("textbox")).toHaveValue(original);
    await page.getByRole("textbox").fill(updated);
    await expect(page.getByRole("button", { name: "수정한 조건으로 다시 분석" })).toBeDisabled();
    expect(mock.writes).toHaveLength(1);
    await page.getByRole("button", { name: "수정 내용 저장" }).click();
    await expect(page.getByText("저장된 입력 #8")).toBeVisible();
    expect(mock.writes).toHaveLength(2);
    await page.getByRole("button", { name: "수정한 조건으로 다시 분석" }).click();
    await expect(page.getByText("새 분석의 합성 후보")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/rooms/${code}$`));
    expect(mock.writes.map(write => write.path)).toEqual([`/api/rooms/${code}/reopen`, `/api/rooms/${code}/submission`, `/api/rooms/${code}/analysis`]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.evaluate(value => Object.values({ ...localStorage, ...sessionStorage }).some(item => String(item).includes(value)), updated)).toBe(false);
    expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });

  test("MEMBER restores and saves only their own input; no command or automatic analysis is exposed", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { role: "MEMBER", open: true });
    await page.goto(`/rooms/${code}`);
    await page.getByRole("button", { name: "내 조건 수정" }).click();
    await expect(page.getByRole("textbox")).toHaveValue(original);
    await page.getByRole("textbox").fill(updated);
    await page.getByRole("button", { name: "수정 내용 저장" }).click();
    await expect(page.getByText("저장된 입력 #8")).toBeVisible();
    await expect(page.getByRole("button", { name: "조건 수정 열기" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "수정한 조건으로 다시 분석" })).toHaveCount(0);
    expect(mock.writes.map(write => write.path)).toEqual([`/api/rooms/${code}/submission`]);
    await page.reload(); await page.getByRole("button", { name: "내 조건 수정" }).click();
    await expect(page.getByRole("textbox")).toHaveValue(updated);
    expect(mock.writes).toHaveLength(1); expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });

  test("legacy server and unjoined correction viewer expose no new command or join flow", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!, { legacy: true });
    await page.goto(`/rooms/${code}`);
    await expect(page.getByText("내 저장 입력 확인")).toBeVisible();
    await expect(page.getByRole("button", { name: "조건 수정 열기" })).toHaveCount(0);
    expect(mock.writes).toHaveLength(0); expect(mock.unexpected).toEqual([]);
    await page.unroute("**/*");
    const unjoined = await fixture(page, baseURL!, { open: true, joined: false });
    await page.reload();
    await expect(page.getByRole("heading", { name: "입력이 마감된 모임이에요" })).toBeVisible();
    await expect(page.getByRole("button", { name: "모임 참여하기" })).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);
    expect(unjoined.writes).toHaveLength(0); expect(unjoined.unexpected).toEqual([]); expect(unjoined.errors).toEqual([]);
  });

  test("keyboard can open correction and edit without automatically saving or analyzing", async ({ page, baseURL }) => {
    const mock = await fixture(page, baseURL!);
    await page.goto(`/rooms/${code}`);
    const open = page.getByRole("button", { name: "조건 수정 열기" });
    await expect(open).toBeVisible();
    for (let index = 0; index < 20; index++) {
      if (await open.evaluate(element => element === document.activeElement)) break;
      await page.keyboard.press("Tab");
    }
    await expect(open).toBeFocused();
    const box = await open.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");
    const edit = page.getByRole("button", { name: "내 조건 수정" });
    await expect(edit).toBeVisible(); await edit.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("textbox")).toHaveValue(original);
    await expect(page.getByRole("button", { name: "수정한 조건으로 다시 분석" })).toBeVisible();
    expect(mock.writes.map(write => write.path)).toEqual([`/api/rooms/${code}/reopen`]);
    expect(mock.unexpected).toEqual([]); expect(mock.errors).toEqual([]);
  });
});
