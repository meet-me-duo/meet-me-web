import { afterEach, describe, expect, it, vi } from "vitest";
import { createOperationsApi } from "./operations";
import { operatorFixture } from "../testing/operatorFixture";

const data = operatorFixture();
const body = { request_id: "00000330-1111-4111-8111-000000000001", source_analysis_id: data.history.items[0]!.id, expected_state_version: 7 };
const receipt = { request_id: body.request_id, source_analysis_id: body.source_analysis_id, analysis_id: "00000440-1111-4111-8111-000000000001", accepted_state_version: 8, accepted_at: "2027-01-04T01:39:00Z", analysis_contract_version: "schedule-dsl-response-6" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("operator diagnostic lineage and explicit reanalysis transport", () => {
  it("selects the exact room analysis and validates real diagnostic shapes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(data.diagnostics)); vi.stubGlobal("fetch", fetcher);
    const result = await createOperationsApi(() => "synthetic-token").diagnostics(data.room.id, body.source_analysis_id);
    expect(result.analysis?.id).toBe(body.source_analysis_id);
    expect(String(fetcher.mock.calls[0]![0])).toContain(`/rooms/${data.room.id}/diagnostics?analysis_id=${body.source_analysis_id}`);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "GET", cache: "no-store" });
  });
  it("omits analysis_id for current collection and rejects a frozen-response substitution", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(data.diagnostics)); vi.stubGlobal("fetch", fetcher);
    await expect(createOperationsApi().diagnostics(data.room.id, null)).rejects.toMatchObject({ status: 503 });
    expect(String(fetcher.mock.calls[0]![0])).not.toContain("analysis_id");
  });
  it("never accepts another room or another historical run as the selected analysis", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...data.diagnostics, room_id: "00000999-1111-4111-8111-000000000001" })); vi.stubGlobal("fetch", fetcher);
    await expect(createOperationsApi().diagnostics(data.room.id, body.source_analysis_id)).rejects.toMatchObject({ status: 503 });
  });
  it.each(["room", "run"])("rejects a nested invocation from a different %s even when top-level lineage matches", async mismatch => {
    const value = operatorFixture().diagnostics;
    const foreign = "00000999-1111-4111-8111-000000000001";
    if (mismatch === "room") value.invocations[0]!.room_id = foreign;
    else value.invocations[0]!.invocation.run_id = foreign;
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json(value)));
    await expect(createOperationsApi().diagnostics(data.room.id, body.source_analysis_id)).rejects.toMatchObject({ status: 503 });
  });
  it("rejects historical execution data injected into current collection", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({ ...data.diagnostics, scope: "CURRENT_COLLECTION", analysis: null })));
    await expect(createOperationsApi().diagnostics(data.room.id, null)).rejects.toMatchObject({ status: 503 });
  });
  it("posts exactly the server command with bearer and preserves the same request on retry", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json(receipt, 202)); vi.stubGlobal("fetch", fetcher);
    const api = createOperationsApi(() => "synthetic-token");
    await api.reanalyze(data.room.id, body); await api.reanalyze(data.room.id, body);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, options] of fetcher.mock.calls) {
      expect(options).toMatchObject({ method: "POST", body: JSON.stringify(body), cache: "no-store", credentials: "include" });
      expect(new Headers(options!.headers).get("Authorization")).toBe("Bearer synthetic-token");
    }
  });
  it.each([400, 401, 403, 409, 429, 503])("does not automatically retry or read arbitrary %s error bodies", async status => {
    const response = json({ detail: "PRIVATE_BODY" }, status); const decode = vi.spyOn(response, "json");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response); vi.stubGlobal("fetch", fetcher);
    await expect(createOperationsApi().reanalyze(data.room.id, body)).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(decode).not.toHaveBeenCalled();
  });
  it("rejects unsafe versions and injected contract overrides before any write", async () => {
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher);
    await expect(createOperationsApi().reanalyze(data.room.id, { ...body, expected_state_version: Number.MAX_SAFE_INTEGER })).rejects.toMatchObject({ status: 400 });
    await expect(createOperationsApi().reanalyze(data.room.id, { ...body, contract: "override" } as typeof body)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("suppresses a late accepted receipt when the account token changes", async () => {
    let token = "account-A"; let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(done => { resolve = done; })); vi.stubGlobal("fetch", fetcher);
    const result = createOperationsApi(() => token).reanalyze(data.room.id, body);
    token = "account-B"; resolve(json(receipt, 202));
    await expect(result).rejects.toMatchObject({ status: 401 });
  });
  it("rejects an unrelated receipt instead of inventing success", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(json({ ...receipt, request_id: "00000999-1111-4111-8111-000000000001" }, 202)));
    await expect(createOperationsApi().reanalyze(data.room.id, body)).rejects.toMatchObject({ status: 503 });
  });
});
