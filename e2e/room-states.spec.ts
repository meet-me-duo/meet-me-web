import { expect, test, type Page } from "@playwright/test";

const code = "abcdefghijklmnopqrstuv";

function room(status: string, joined = true, role: "HOST" | "MEMBER" = "MEMBER") {
  return {
    invite_code: code,
    purpose: "졸업 프로젝트 회의",
    meeting_mode: "EITHER",
    time_zone_id: "Asia/Seoul",
    search_start_date: "2026-09-21",
    search_end_date: "2026-09-28",
    search_range_source: "DEFAULTED",
    expected_participants: 4,
    submission_deadline: null,
    manual_only: false,
    collection_status: status === "COLLECTING" ? "COLLECTING" : "CLOSED",
    closure_reason: status === "COLLECTING" ? null : "EXPECTED_PARTICIPANTS",
    closed_at: status === "COLLECTING" ? null : "2026-09-20T12:00:00Z",
    public_status: status,
    viewer: { joined, display_name: joined ? "지수" : null, role: joined ? role : null },
    input_disclosure_policy: "HOST_ON_PARTIAL_RESULT",
  };
}

const candidate = {
  candidate_id: "11111111-1111-1111-1111-111111111111",
  plan_type: "A",
  meeting_mode: "REMOTE",
  rank: 1,
  attendance_count: 4,
  total_participants: 4,
  time_ranges: [{ start_at: "2026-09-22T10:00:00Z", end_at: "2026-09-22T12:00:00Z" }],
  place: null,
  summary: "화요일 저녁 전원이 가능한 비대면 일정",
};

async function mockRoom(page: Page, status: string, options: { joined?: boolean; role?: "HOST" | "MEMBER" } = {}) {
  await page.route("**/api/rooms/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/submission")) return route.fulfill({ status: 404, contentType: "application/problem+json", body: JSON.stringify({ code: "SUBMISSION_NOT_FOUND", detail: "제출 없음" }) });
    if (url.endsWith("/candidates")) return route.fulfill({ json: { quality: "COMPLETE", applied_submissions: 4, total_submissions: 4, unapplied_inputs: 0, candidates: [candidate] } });
    if (url.endsWith("/result")) return route.fulfill({ json: { candidate, confirmed_at: "2026-09-20T13:00:00Z" } });
    if (url.endsWith("/participants") && route.request().method() === "POST") return route.fulfill({ status: 201, json: room(status, true, "MEMBER") });
    return route.fulfill({ json: room(status, options.joined ?? true, options.role ?? "MEMBER") });
  });
}

test("a new browser is asked to join before seeing the room", async ({ page }) => {
  await mockRoom(page, "COLLECTING", { joined: false });
  await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("heading", { name: "졸업 프로젝트 회의" })).toBeVisible();
  await page.getByLabel("내 이름").fill("지수");
  await page.getByRole("button", { name: "모임 참여하기" }).click();
  await expect(page.getByRole("heading", { name: "가능한 조건을 알려주세요" })).toBeVisible();
});

test("brand link returns to the landing page", async ({ page }) => {
  await mockRoom(page, "COLLECTING");
  await page.goto(`/rooms/${code}`);
  await page.getByRole("link", { name: "Meet me 홈" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: /조건만 말하세요/ })).toBeVisible();
});

for (const [status, heading] of [
  ["ANALYZING", "모두의 조건을 분석하고 있어요"],
  ["INSUFFICIENT_PARTICIPANTS", "조율에 필요한 인원이 부족해요"],
  ["ANALYSIS_DELAYED", "분석이 잠시 지연되고 있어요"],
  ["NO_MATCH", "모두에게 맞는 후보를 찾지 못했어요"],
] as const) {
  test(`${status} has a dedicated terminal screen`, async ({ page }) => {
    await mockRoom(page, status);
    await page.goto(`/rooms/${code}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  });
}

test("host sees server-ranked candidates and confirmation action", async ({ page }) => {
  await mockRoom(page, "READY", { role: "HOST" });
  await page.goto(`/rooms/${code}`);
  await expect(page.getByText(candidate.summary)).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan A로 확정" })).toBeVisible();
});

test("confirmed room renders the final result", async ({ page }) => {
  await mockRoom(page, "CONFIRMED");
  await page.goto(`/rooms/${code}`);
  await expect(page.getByRole("heading", { name: "우리의 만남이 정해졌어요!" })).toBeVisible();
  await expect(page.getByText("최종 확정된 일정")).toBeVisible();
});
