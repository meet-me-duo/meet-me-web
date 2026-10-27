import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRecoveryIdentity, QuarantinedDraft } from "./draftQuarantine";

const record: QuarantinedDraft = {
  verifiedAccountId: "11111111-2222-4333-8444-555555555555", room: "abcdefghijklmnopqrstuv", viewerContext: "22222222-2222-4222-8222-222222222222",
  candidateBaseRevision: 3, editorKind: "PRECHECK", rawText: "  합성 미저장 조건\n주말 아무 때나  ",
};
const proof = (overrides: Partial<DraftRecoveryIdentity> = {}): DraftRecoveryIdentity => ({ verifiedAccountId: record.verifiedAccountId, room: record.room, viewerContext: record.viewerContext, candidateRevision: record.candidateBaseRevision, editorKind: record.editorKind, ...overrides });

// The caller must obtain this identity from a current account plus fresh server
// ownership/private reads. This store itself does not authenticate claimed IDs.
describe("issue132 one bounded memory-only owner-bound quarantine", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("retains exact raw text for a fresh matching account/room/context/revision/editor proof", async () => {
    const draft = await import("./draftQuarantine"); expect(draft.quarantineDraft(record)).toBe(true);
    expect(draft.recoverQuarantinedDraft(proof())).toEqual({ rawText: record.rawText, candidateBaseRevision: 3, conflict: false });
  });

  it.each([
    { verifiedAccountId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" },
    { room: "bcdefghijklmnopqrstuvwx" },
    { viewerContext: "33333333-3333-4333-8333-333333333333" },
    { editorKind: "LEGACY" as const },
  ])("returns no raw text for a mismatching verified binding %#", async mismatch => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record);
    expect(draft.recoverQuarantinedDraft(proof(mismatch))).toBeNull();
  });

  it.each([2, 4])("exposes a revision%s mismatch only as a conflict without silently rebasing the draft", async revision => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record);
    expect(draft.recoverQuarantinedDraft(proof({ candidateRevision: revision }))).toEqual({ rawText: record.rawText, candidateBaseRevision: 3, conflict: true });
    expect(draft.recoverQuarantinedDraft(proof())).toEqual({ rawText: record.rawText, candidateBaseRevision: 3, conflict: false });
  });

  it("stores at most one record across rooms and cannot recover the replaced room's raw text", async () => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record);
    const next = { ...record, room: "bcdefghijklmnopqrstuvwx", rawText: "다른 방의 합성 임시 조건" };
    expect(draft.quarantineDraft(next)).toBe(true);
    expect(draft.recoverQuarantinedDraft(proof())).toBeNull();
    expect(draft.recoverQuarantinedDraft(proof({ room: next.room }))).toEqual({ rawText: next.rawText, candidateBaseRevision: 3, conflict: false });
  });

  it("accepts exactly500 Unicode code points without truncation or normalizing whitespace", async () => {
    const draft = await import("./draftQuarantine"); const text = ` ${"😀".repeat(498)} `;
    expect(Array.from(text)).toHaveLength(500); expect(draft.quarantineDraft({ ...record, rawText: text })).toBe(true);
    expect(draft.recoverQuarantinedDraft(proof())?.rawText).toBe(text);
  });

  it.each(["😀".repeat(501), " ".repeat(500) + "가"])("refuses oversized exact raw and clears the same-owner older draft instead of resurrecting stale text %#", async text => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record);
    expect(draft.quarantineDraft({ ...record, rawText: text })).toBe(false);
    expect(draft.recoverQuarantinedDraft(proof())).toBeNull();
  });

  it("clears a deliberately emptied draft rather than reviving its previous contents", async () => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record);
    expect(draft.quarantineDraft({ ...record, rawText: "" })).toBe(false); expect(draft.recoverQuarantinedDraft(proof())).toBeNull();
  });

  it("keeps A through same-account verification but irreversibly clears it when B authenticates", async () => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record);
    draft.retainQuarantinedDraftForAccount(record.verifiedAccountId); expect(draft.recoverQuarantinedDraft(proof())?.rawText).toBe(record.rawText);
    draft.retainQuarantinedDraftForAccount("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    draft.retainQuarantinedDraftForAccount(record.verifiedAccountId); expect(draft.recoverQuarantinedDraft(proof())).toBeNull();
  });

  it("supports idempotent explicit discard and does not persist across a fresh document module", async () => {
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record); draft.clearQuarantinedDraft(); draft.clearQuarantinedDraft();
    expect(draft.recoverQuarantinedDraft(proof())).toBeNull(); draft.quarantineDraft(record);
    vi.resetModules(); const fresh = await import("./draftQuarantine"); expect(fresh.recoverQuarantinedDraft(proof())).toBeNull();
  });

  it("never uses browser storage, fetch or logging to retain or recover private raw/account bindings", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem"); const set = vi.spyOn(Storage.prototype, "setItem"); const remove = vi.spyOn(Storage.prototype, "removeItem");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); const log = vi.spyOn(console, "log").mockImplementation(() => {}); const warn = vi.spyOn(console, "warn").mockImplementation(() => {}); const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const draft = await import("./draftQuarantine"); draft.quarantineDraft(record); draft.recoverQuarantinedDraft(proof()); draft.retainQuarantinedDraftForAccount(record.verifiedAccountId); draft.clearQuarantinedDraft();
    expect(get).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });
});
