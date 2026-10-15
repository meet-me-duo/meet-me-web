import { expect, test, type BrowserContext } from "@playwright/test";
import type { Room } from "../src/api/types";

const code = "abcdefghijklmnopqrstuv";
const room: Room = { invite_code: code, purpose: "방 생성과 주최자 제출 분리", meeting_mode: "EITHER", time_zone_id: "Asia/Seoul", search_start_date: "2026-10-15", search_end_date: "2026-10-29", search_range_source: "DEFAULTED", expected_participants: 4, submission_deadline: null, manual_only: false, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", viewer: { joined: true, role: "HOST", display_name: "합성 주최자", context_id: "synthetic-host" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT" };

async function fixture(context: BrowserContext, failSave: boolean | "after-save" = false, currentRoom: () => Room = () => room) {
  const calls = { create: 0, join: 0, save: 0, unexpected: [] as string[] };
  let stored: null | { raw_text: string; revision: number; locale: string; created_at: string; editable: boolean } = null;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== "http://127.0.0.1:4173") { calls.unexpected.push(url.origin); return route.abort(); }
    if (url.pathname === "/api/rooms" && request.method() === "POST") {
      calls.create++;
      expect(request.postDataJSON()).not.toHaveProperty("raw_text");
      return route.fulfill({ status: 201, json: room });
    }
    if (url.pathname === `/api/rooms/${code}` && request.method() === "GET") return route.fulfill({ json: currentRoom() });
    if (url.pathname.endsWith("/participants")) { calls.join++; return route.fulfill({ json: room }); }
    if (url.pathname.endsWith("/submission")) {
      if (request.method() === "PUT") {
        calls.save++;
        if (failSave === true && calls.save === 1) return route.fulfill({ status: 503, json: { detail: "합성 제출 실패" } });
        const { raw_text } = request.postDataJSON();
        if (stored?.raw_text !== raw_text) stored = { raw_text, revision: (stored?.revision ?? 0) + 1, locale: "ko-KR", created_at: "2026-10-15T00:00:00Z", editable: true };
        if (failSave === "after-save" && calls.save === 1) return route.abort("failed");
      }
      return stored ? route.fulfill({ json: stored }) : route.fulfill({ status: 404, json: { code: "SUBMISSION_NOT_FOUND" } });
    }
    if (url.pathname.startsWith("/api/")) { calls.unexpected.push(url.pathname); return route.abort(); }
    return route.continue();
  });
  return calls;
}

test("create, share before submission, defer, refresh and return to the same HOST", async ({ page, context }, testInfo) => {
  const calls = await fixture(context);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/create");
  await page.getByLabel("주최자 이름").fill("합성 주최자");
  await page.getByLabel("모임 목적 / 이름").fill(room.purpose);
  await expect(page.getByRole("textbox")).toHaveCount(2);
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await expect(page.getByText(/내 시간·장소 조건은 방을 만든 뒤 입력/)).toBeVisible();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "모임이 만들어졌어요" })).toBeVisible();
  await expect(page.getByText(/아직 내 조건은 제출하지 않았어요/)).toBeVisible();
  await page.getByRole("button", { name: "초대 링크 복사" }).click();
  await expect(page.getByText("링크를 복사했어요.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`http://127.0.0.1:4173/rooms/${code}`);
  await page.screenshot({ path: testInfo.outputPath("host-before-submission.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "나중에 입력하기" }).click();
  await page.goto(`/rooms/${code}`); await page.reload();
  await expect(page.getByRole("heading", { name: "모임이 만들어졌어요" })).toBeVisible();
  await expect(page.getByRole("button", { name: "모임 참여하기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "입력 마감하기" })).toBeVisible();
  expect(calls).toEqual({ create: 1, join: 0, save: 0, unexpected: [] });
});

test("failed conditions preserve the room and retry only the original submission", async ({ page, context }) => {
  const calls = await fixture(context, true);
  await page.goto(`/rooms/${code}`);
  await page.getByRole("button", { name: "내 조건 입력하기" }).click();
  const input = page.getByRole("textbox");
  await expect(input).toBeFocused();
  await input.fill("화요일 저녁, 온라인 가능");
  await expect(page.getByRole("link", { name: "나중에 입력하기" })).toHaveCount(0);
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByText(/조건 저장 결과를 확인하지 못했어요/)).toBeVisible();
  await expect(input).toHaveValue("화요일 저녁, 온라인 가능");
  await expect(page.getByRole("button", { name: "초대 링크 복사" })).toBeEnabled();
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "모임이 만들어졌어요" })).toHaveCount(0);
  expect(calls).toEqual({ create: 0, join: 0, save: 2, unexpected: [] });
});


test("a first HOST draft survives deadline closure only in the current owner page", async ({ page, context }) => {
  let current = room;
  const calls = await fixture(context, false, () => current);
  await page.clock.install();
  await page.goto(`/rooms/${code}`);
  const raw = "  화요일 저녁의 미저장 합성 조건  ";
  await page.getByRole("textbox").fill(raw);
  current = { ...room, collection_status: "CLOSED", public_status: "INSUFFICIENT_PARTICIPANTS", closure_reason: "DEADLINE", closed_at: "2026-10-15T01:00:00Z" };
  await page.clock.fastForward(5_100);
  const retained = page.getByLabel("내 임시 조건");
  await expect(retained).toHaveValue(raw); await expect(retained).toHaveAttribute("readonly", "");
  await expect(page.getByRole("button", { name: "조건 제출하기" })).toHaveCount(0);
  await expect(page.getByText(/새로고침하거나 다른 모임으로 이동하면 사라져요/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "조율에 필요한 인원이 부족해요" })).toBeVisible();
  await expect(page.getByLabel("내 임시 조건")).toHaveCount(0);
  expect(calls).toEqual({ create: 0, join: 0, save: 0, unexpected: [] });
});

test("an unacknowledged create response does not claim that creation failed", async ({ page, context }) => {
  const calls = await fixture(context);
  let attempts = 0;
  await context.route("**/api/rooms", route => { attempts++; return route.abort("failed"); });
  await page.goto("/create");
  await page.getByLabel("주최자 이름").fill("합성 주최자");
  await page.getByLabel("모임 목적 / 이름").fill(room.purpose);
  await page.getByRole("button", { name: /다음 단계/ }).click();
  await page.getByRole("button", { name: "방 만들기", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("방 생성 결과를 확인하지 못했어요.");
  await expect(page.getByRole("alert")).toContainText("이미 만들어졌을 수 있어요");
  await expect(page.getByRole("alert")).not.toContainText("방을 만들지 못했어요");
  expect(attempts).toBe(1); expect(calls).toEqual({ create: 0, join: 0, save: 0, unexpected: [] });
});

test("a lost save acknowledgement retries the same mock participant without another revision", async ({ page, context }) => {
  const calls = await fixture(context, "after-save");
  await page.goto(`/rooms/${code}`);
  await page.getByRole("textbox").fill("화요일 저녁 온라인 가능");
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByText(/조건 저장 결과를 확인하지 못했어요/)).toBeVisible();
  await expect(page.getByText(/아직 내 조건은 제출하지 않았어요/)).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveValue("화요일 저녁 온라인 가능");
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  expect(calls).toEqual({ create: 0, join: 0, save: 2, unexpected: [] });
});

test("a trusted own read resolves a lost acknowledgement without another PUT", async ({ page, context }) => {
  const calls = await fixture(context, "after-save");
  await page.clock.install();
  await page.goto(`/rooms/${code}`);
  await page.getByRole("textbox").fill("화요일 저녁 온라인 가능");
  await page.getByRole("button", { name: "조건 제출하기" }).click();
  await expect(page.getByText(/조건 저장 결과를 확인하지 못했어요/)).toBeVisible();
  await expect(page.getByText(/아직 내 조건은 제출하지 않았어요/)).toHaveCount(0);
  await page.clock.fastForward(5_100);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("heading", { name: "조건 제출을 완료했어요" })).toBeVisible();
  await expect(page.getByText(/조건 저장 결과를 확인하지 못했어요/)).toHaveCount(0);
  await expect(page.getByText("저장된 입력 #1")).toBeVisible();
  expect(calls).toEqual({ create: 0, join: 0, save: 1, unexpected: [] });
});
