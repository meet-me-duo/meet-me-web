import { expect, test, type Page } from "@playwright/test";
const code = "a".repeat(22), other = "b".repeat(22);
const firstName = "주말 독서 모임", secondName = "팀 점심 약속";
async function fixture(page: Page, baseURL: string) {
  const state = { title: firstName, account: "A" as string | null, guestJoined: false, expiry: "2026-12-03T00:00:00Z" as unknown, roomCalls: 0, listCalls: 0, logoutCalls: 0, calls: 0, fail: true, wait: null as Promise<void> | null, unexpected: [] as string[], errors: [] as string[] };
  const hidden = new Map<string, Set<string>>();
  const rows = [code, other].map((invite_code, i) => ({ invite_code, purpose: i ? secondName : firstName, role: i ? "MEMBER" : "HOST", created_at: "2026-11-03T00:00:00Z", expires_at: "2026-12-03T00:00:00Z" }));
  const text = { revision: 1, raw_text: "토요일 오후에 온라인으로 만날 수 있어요.", created_at: "2026-11-03T01:00:00Z", interpretation_reference_at: "2026-11-03T01:00:00Z" };
  const room = { invite_code: code, purpose: firstName, meeting_mode: "REMOTE", time_zone_id: "Asia/Seoul", search_start_date: "2026-11-03", search_end_date: "2026-11-10", search_range_source: "HOST_SPECIFIED", expected_participants: null, submission_deadline: null, manual_only: true, collection_status: "COLLECTING", closure_reason: null, closed_at: null, public_status: "COLLECTING", state_version: 1, viewer: { joined: true, role: "HOST", display_name: "지민", context_id: "33333333-3333-4333-8333-333333333333" }, input_disclosure_policy: "HOST_ON_PARTIAL_RESULT", submission_protocol: "PRE_SUBMIT_V1" };
  page.on("pageerror", e => state.errors.push(e.message));
  await page.route("**/*", async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== new URL(baseURL).origin) { state.unexpected.push(req.url()); return route.abort(); }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/refresh") {
      if (state.account === null) return route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } });
      const now = await req.frame().evaluate(() => Date.now());
      return route.fulfill({ json: { accessToken: `synthetic-${state.account}`, expiresAt: new Date(now + 900_000).toISOString(), account: { id: state.account === "A" ? "11111111-2222-4333-8444-555555555555" : "22222222-2222-4333-8444-555555555555", displayName: state.account === "A" ? "지민" : "서준" } } });
    }
    if (url.pathname === "/api/auth/logout" && req.method() === "POST") {
      state.logoutCalls++;state.account=null;return route.fulfill({status:204});
    }
    if (url.pathname === `/api/rooms/${code}` && req.method() === "GET") {
      state.roomCalls++;
      const viewer = state.account === null ? { joined: state.guestJoined, role: state.guestJoined ? "MEMBER" : null, display_name: state.guestJoined ? "하린" : null } : { ...room.viewer, display_name: state.account === "A" ? "지민" : "서준" };
      return route.fulfill({ json: { ...room, expires_at: state.expiry, purpose: state.title, viewer } });
    }
    if (url.pathname === `/api/rooms/${code}/guest-records` && req.method() === "GET") return route.fulfill({ json: { records: [] } });
    if (url.pathname === `/api/rooms/${code}/submission/checks/current` && req.method() === "GET") return route.fulfill({ json: { candidate: text, accepted: { ...text, confirmation_source: "PRECHECK" }, check: { id: "22222222-2222-4222-8222-222222222222", status: "CLEAR", version: 1, retry_allowed: false, failure_code: null, question: null }, submission_complete: true, applied_to_result: false, room: { collection_status: "COLLECTING", state_version: 1, submission_deadline: null }, operation_outcome: null } });
    if (url.pathname === "/api/account/rooms" && req.method() === "GET") { state.listCalls++; return route.fulfill({ json: { rooms: rows.filter(row => !hidden.get(state.account)?.has(row.invite_code)).map(row => row.invite_code === code ? { ...row, purpose: state.title } : row), has_more: false, next_cursor: null } }); }
    if (url.pathname === `/api/account/rooms/${code}/hide` && req.method() === "POST") {
      state.calls++; expect(req.postData()).toBeNull(); const account = state.account;
      if (state.wait) await state.wait;
      if (state.fail) return route.fulfill({ status: 503, json: { detail: "잠시 후 다시 시도해 주세요." } }).catch(() => {});
      const set = hidden.get(account) ?? new Set<string>(); set.add(code); hidden.set(account, set);
      return route.fulfill({ status: 204 }).catch(() => {});
    }
    state.unexpected.push(req.method() + " " + url.pathname); return route.abort();
  });
  return state;
}
for (const width of [320, 390, 1440]) test(`personal deletion confirmation, focus and retention at ${width}px`, async ({ page, baseURL }, info) => {
  await page.clock.install({ time: new Date("2026-11-03T12:00:00Z") });
  const state = await fixture(page, baseURL!); await page.setViewportSize({ width, height: width === 320 ? 480 : 844 }); await page.goto("/account/rooms");
  const trigger = page.getByRole("button", { name: `${firstName} 내 목록에서 삭제` });
  await expect(trigger).toHaveText("삭제"); await expect(page.locator(".account-history-created")).toHaveCount(2); await expect(page.getByText("정리 예정", { exact: true })).toHaveCount(0);
  const triggerBox = (await trigger.boundingBox())!, cardBox = (await page.locator(".account-history-item").first().boundingBox())!;
  expect(triggerBox.width).toBeGreaterThanOrEqual(44);expect(triggerBox.height).toBeGreaterThanOrEqual(44);expect(triggerBox.y-cardBox.y).toBeLessThan(16);
  await page.screenshot({ path: info.outputPath("list.png"), fullPage: true });
  await trigger.focus(); await page.keyboard.press("Enter"); const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible(); await expect(dialog).toContainText("되돌릴 수 없어요"); await expect(dialog).toContainText("기존 참여 및 직접 링크");
  const cancel = dialog.getByRole("button", { name: "취소", exact: true }), confirm = dialog.getByRole("button", { name: "내 목록에서 삭제", exact: true });
  await expect(cancel).toBeFocused(); await page.keyboard.press("Shift+Tab"); await expect(confirm).toBeFocused(); await page.keyboard.press("Tab"); await expect(cancel).toBeFocused();
  await page.screenshot({ path: info.outputPath("confirm.png"), fullPage: true });
  if (info.project.name === "mobile") await page.touchscreen.tap(2,2); else await page.mouse.click(2,2); await expect(dialog).toBeVisible(); expect(state.calls).toBe(0);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();expect(state.calls).toBe(0);
  if (info.project.name === "mobile") await trigger.tap(); else await trigger.click();await dialog.getByRole("button", {name:"취소",exact:true}).click();await expect(trigger).toBeFocused();expect(state.calls).toBe(0);
  await trigger.click();await dialog.getByRole("button", {name:"내 목록에서 삭제",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("잠시 후");expect(state.calls).toBe(1);
  state.fail=false;let release!:()=>void;state.wait=new Promise<void>(done=>{release=done;});
  await dialog.getByRole("button", {name:"내 목록에서 삭제",exact:true}).evaluate(node=>{(node as HTMLButtonElement).click();(node as HTMLButtonElement).click();});
  await expect.poll(()=>state.calls).toBe(2);await expect(dialog.getByRole("button",{name:"취소",exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(dialog).toBeVisible();release();
  await expect(dialog).toHaveCount(0);await expect(page.getByRole("heading",{name:"내 모임",exact:true})).toBeFocused();await expect(page.getByRole("link",{name:new RegExp(firstName)})).toHaveCount(0);
  await page.reload();await expect(page.getByRole("link",{name:new RegExp(secondName)})).toHaveAttribute("href",`/rooms/${other}`);
  state.account="B";await page.reload();await expect(page.getByRole("link",{name:new RegExp(firstName)})).toBeVisible();
  await page.getByRole("link",{name:new RegExp(firstName)}).click();await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");await page.screenshot({path:info.outputPath("detail.png"),fullPage:true});
  await page.reload();await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test("leaving or switching account during pending deletion ignores the old completion", async ({page,baseURL})=>{
  const state=await fixture(page,baseURL!);state.fail=false;let release!:()=>void;state.wait=new Promise<void>(done=>{release=done;});
  await page.goto("/account/rooms");await page.getByRole("button",{name:`${firstName} 내 목록에서 삭제`}).click();await page.getByRole("dialog").getByRole("button",{name:"내 목록에서 삭제",exact:true}).click();await expect.poll(()=>state.calls).toBe(1);
  state.account="B";await page.reload();await expect(page.getByRole("link",{name:new RegExp(firstName)})).toBeVisible();release();await expect(page.getByRole("dialog")).toHaveCount(0);await expect(page.getByRole("link",{name:new RegExp(firstName)})).toBeVisible();expect(state.calls).toBe(1);expect(state.errors).toEqual([]);
});

test("long titles keep deletion separate from navigation on a narrow viewport", async ({page,baseURL})=>{
  const state=await fixture(page,baseURL!);state.title="토요일에함께책을읽는모임".repeat(5)+"A".repeat(30);
  await page.setViewportSize({width:320,height:480});await page.goto("/account/rooms");
  const button=page.getByRole("button",{name:`${state.title} 내 목록에서 삭제`});const link=page.getByRole("link",{name:new RegExp(state.title)});
  const a=(await link.boundingBox())!,b=(await button.boundingBox())!;expect(a.x+a.width).toBeLessThanOrEqual(b.x-8);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);await button.click();await expect(page).toHaveURL(/account\/rooms$/);expect(state.calls).toBe(0);
  const dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"취소",exact:true})).toBeFocused();await page.keyboard.press("Escape");await expect(button).toBeFocused();expect(state.calls).toBe(0);
});
for (const [width,height] of [[375,667],[844,390]]) test(`deletion modal remains usable with enlarged text and reduced motion at ${width}x${height}`,async({page,baseURL})=>{
 const state=await fixture(page,baseURL!);await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:"reduce",colorScheme:"dark"});await page.goto("/account/rooms");await page.addStyleTag({content:"html { font-size: 200%; }"});
 const trigger=page.getByRole("button",{name:`${firstName} 내 목록에서 삭제`});await trigger.click();const dialog=page.getByRole("dialog"),cancel=dialog.getByRole("button",{name:"취소",exact:true});await expect(cancel).toBeFocused();
 const box=(await dialog.boundingBox())!,action=(await cancel.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.height).toBeLessThanOrEqual(height-31);expect(action.y).toBeGreaterThanOrEqual(0);expect(action.y+action.height).toBeLessThanOrEqual(height);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await page.keyboard.press("Escape");await expect(trigger).toBeFocused();expect(state.calls).toBe(0);expect(state.errors).toEqual([]);
});

for (const account of ["A", "B", null]) test(`detail expiry survives direct entry and reload without history for ${account ?? "guest"}`, async ({page,baseURL},info) => {
  await page.clock.install({time:new Date("2026-11-03T12:00:00Z")});
  const state=await fixture(page,baseURL!);state.account=account;
  await page.goto(`/rooms/${code}`);
  await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");
  await page.reload();await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");
  await page.screenshot({path:info.outputPath("direct-detail.png"),fullPage:true});
  state.account=account===null?"B":null;
  await page.reload();await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");
  expect(state.listCalls).toBe(0);expect(state.roomCalls).toBeGreaterThanOrEqual(3);expect(state.calls).toBe(0);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
test("detail clock uses KST midnight and the expiry instant, with missing/invalid compatibility",async({page,baseURL})=>{
  await page.clock.install({time:new Date("2026-12-02T14:59:00Z")});
  const state=await fixture(page,baseURL!);state.account=null;state.guestJoined=true;state.expiry="2026-12-02T15:00:37.250Z";
  await page.goto(`/rooms/${code}`);const notice=page.locator(".room-retention-hint");await expect(notice).toHaveText("자동 정리 D-1");
  await page.clock.pauseAt(new Date("2026-12-02T14:59:59.500Z"));
  await page.clock.runFor(500);await expect(notice).toHaveText("자동 정리 D-0");
  await page.clock.runFor(37_250);await expect(notice).toHaveText("자동 정리 예정");
  await page.clock.resume();
  for(const value of [undefined,null,"not-a-date","2026-02-30T00:00:00Z"]){state.expiry=value;await page.reload();await expect(page.getByRole("heading",{name:firstName,exact:true})).toBeVisible();await expect(notice).toHaveCount(0);}
  expect(state.listCalls).toBe(0);expect(state.calls).toBe(0);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});

test("an in-page account logout reloads detail evidence without losing the public D-day",async({page,baseURL})=>{
  await page.clock.install({time:new Date("2026-11-03T12:00:00Z")});const state=await fixture(page,baseURL!);
  await page.goto(`/rooms/${code}`);await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");
  await page.getByRole("button",{name:"지민 계정 메뉴"}).click();await page.getByRole("button",{name:"로그아웃",exact:true}).click();
  await expect(page.getByRole("link",{name:"로그인",exact:true})).toBeVisible();
  await expect(page.locator(".room-retention-hint")).toHaveText("자동 정리 D-30");await expect.poll(()=>state.roomCalls).toBeGreaterThanOrEqual(2);
  expect(state.logoutCalls).toBe(1);expect(state.listCalls).toBe(0);expect(state.calls).toBe(0);expect(state.unexpected).toEqual([]);expect(state.errors).toEqual([]);
});
