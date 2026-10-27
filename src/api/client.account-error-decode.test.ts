import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./client";

const identity = vi.hoisted(() => ({ epoch: 1 }));
vi.mock("../auth/session", () => ({
  getAccessToken: () => "synthetic-access-a",
  getSessionVersion: () => identity.epoch,
}));
afterEach(() => { vi.unstubAllGlobals(); identity.epoch = 1; });

it("#109 rejects an old-account problem after the account changes during error JSON decoding", async () => {
  let finishBody!: (value: unknown) => void;
  let started!: () => void;
  const decoding = new Promise<void>(resolve => { started = resolve; });
  const body = new Promise<unknown>(resolve => { finishBody = resolve; });
  const fetch = vi.fn().mockResolvedValue({
    ok: false, status: 401, headers: new Headers(),
    json: () => { started(); return body; },
  });
  vi.stubGlobal("fetch", fetch);
  const result = api.getSubmission("abcdefghijklmnopqrstuv").then(() => null, error => error as ApiError);
  await decoding;
  identity.epoch++;
  finishBody({ code: "AUTH_ACCESS_INVALID", detail: "previous account private problem" });
  const failure = await result;
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure?.problem.code).toBe("AUTH_CONTEXT_CHANGED");
  expect(failure?.message).not.toContain("previous account private problem");
  expect(fetch).toHaveBeenCalledTimes(1);
});
