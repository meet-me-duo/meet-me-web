import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./client";
const identity = vi.hoisted(() => ({ epoch: 1 }));
vi.mock("../auth/session", () => ({ getAccessToken: () => "synthetic", getSessionVersion: () => identity.epoch }));
beforeEach(() => { identity.epoch = 1; });
afterEach(() => { vi.unstubAllGlobals(); });
it("posts no body and accepts repeated empty 204 without JSON parsing", async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
  await expect(api.hideAccountRoom("synthetic/code")).resolves.toBeUndefined();
  await expect(api.hideAccountRoom("synthetic/code")).resolves.toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0]![0]).toContain("/api/account/rooms/synthetic%2Fcode/hide");
  const init = fetch.mock.calls[0]![1];
  expect(init.method).toBe("POST"); expect(init.body).toBeUndefined(); expect(init.credentials).toBe("include");
  expect(new Headers(init.headers).get("Content-Type")).toBeNull();
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic");
});
it.each([[401, "ACCOUNT_REQUIRED"], [403, "ORIGIN_NOT_ALLOWED"], [404, "ROOM_NOT_FOUND"]])("preserves %s error", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code }), { status })));
  await expect(api.hideAccountRoom("synthetic")).rejects.toMatchObject({ status, problem: { code } });
});
it("rejects late 204 after account change", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
  const pending = api.hideAccountRoom("synthetic"); await Promise.resolve(); identity.epoch++;
  resolve(new Response(null, { status: 204 }));
  await expect(pending).rejects.toMatchObject({ problem: { code: "AUTH_CONTEXT_CHANGED" } });
});
it("does not turn an unexpected 200 into success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
  await expect(api.hideAccountRoom("synthetic")).rejects.toMatchObject({ status: 502 });
});

it("handles a non-JSON CORS403 without parsing it as success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Forbidden", { status: 403, statusText: "Forbidden", headers: { "Content-Type": "text/plain" } })));
  await expect(api.hideAccountRoom("synthetic")).rejects.toMatchObject({ status: 403, problem: { detail: "Forbidden" } });
});

it("preserves authentication key unavailability503 without inventing an error code", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "인증 검증 키 사용 불가" }), { status: 503 })));
  await expect(api.hideAccountRoom("synthetic")).rejects.toMatchObject({ status: 503, problem: { detail: "인증 검증 키 사용 불가" } });
});
