import { afterEach, expect, it } from "vitest";
import { clearQuarantinedDraft, hasQuarantinedDraft, quarantineDraft, recoverQuarantinedDraft, type DraftRecoveryIdentity, type QuarantinedDraft } from "./draftQuarantine";

// Independent EX-PRIVACY/EX-ORIGINAL: a scoped answer is bound to its actual question and verified owner.
const question = "33333333-3333-4333-8333-333333333333";
const record: QuarantinedDraft = {
  verifiedAccountId: "account-a", room: "room-a", viewerContext: "participant-a", candidateBaseRevision: 1,
  editorKind: "PRECHECK_ANSWER", questionId: question, rawText: "제 개인 답변입니다",
};
const identity: DraftRecoveryIdentity = {
  verifiedAccountId: "account-a", room: "room-a", viewerContext: "participant-a", candidateRevision: 1,
  editorKind: "PRECHECK_ANSWER", questionId: question,
};
afterEach(() => clearQuarantinedDraft());

it("EX-DRAFT a scoped answer restores only for the exact verified question identity", () => {
  expect(quarantineDraft(record)).toBe(true);
  expect(recoverQuarantinedDraft(identity)).toEqual({ rawText: record.rawText, candidateBaseRevision: 1, conflict: false });
});

it("EX-DRAFT another question or an omitted question cannot recover a saved answer", () => {
  quarantineDraft(record);
  expect(recoverQuarantinedDraft({ ...identity, questionId: "44444444-4444-4444-8444-444444444444" })).toBeNull();
  expect(recoverQuarantinedDraft({ ...identity, questionId: undefined })).toBeNull();
  expect(hasQuarantinedDraft()).toBe(true);
  expect(recoverQuarantinedDraft(identity)?.rawText).toBe(record.rawText);
});

it("EX-DRAFT a saved answer cannot be restored into an original editor", () => {
  quarantineDraft(record);
  expect(recoverQuarantinedDraft({ ...identity, editorKind: "PRECHECK", questionId: undefined })).toBeNull();
  expect(recoverQuarantinedDraft({ ...identity, editorKind: "LEGACY", questionId: undefined })).toBeNull();
});

it("EX-DRAFT a scoped answer without an actual question cannot enter quarantine", () => {
  expect(quarantineDraft({ ...record, questionId: undefined })).toBe(false);
  expect(hasQuarantinedDraft()).toBe(false);
  expect(quarantineDraft({ ...record, questionId: "" })).toBe(false);
  expect(hasQuarantinedDraft()).toBe(false);
});

it("EX-DRAFT the same question at a changed revision restores only as a conflict", () => {
  quarantineDraft(record);
  expect(recoverQuarantinedDraft({ ...identity, candidateRevision: 2 })).toEqual({ rawText: record.rawText, candidateBaseRevision: 1, conflict: true });
});

it("EX-PRIVACY question binding never replaces account room and participant proof", () => {
  quarantineDraft(record);
  expect(recoverQuarantinedDraft({ ...identity, verifiedAccountId: "account-b" })).toBeNull();
  expect(recoverQuarantinedDraft({ ...identity, room: "room-b" })).toBeNull();
  expect(recoverQuarantinedDraft({ ...identity, viewerContext: "participant-b" })).toBeNull();
});
