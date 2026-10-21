import type { components } from "./schema";
import type { Complete } from "./types";

export type SubmissionCheckStatus = components["schemas"]["PrecheckStateResponse"]["status"];
export type SubmissionCheckVersion = Complete<components["schemas"]["PrecheckTextResponse"]>;
export type AcceptedSubmissionCheckVersion = Complete<components["schemas"]["PrecheckAcceptedResponse"]>;
export type SubmissionCheckQuestion = Omit<Complete<components["schemas"]["PrecheckQuestionResponse"]>, "options"> & {
  options: Complete<components["schemas"]["PrecheckOptionResponse"]>[];
};
type CheckState = Omit<Complete<components["schemas"]["PrecheckStateResponse"]>, "question"> & {
  question: SubmissionCheckQuestion | null;
};
// Normalize nested required fields through the generated native DTOs. Candidate
// and accepted revisions remain independent and are never compared to each other.
export type SubmissionCheckSnapshot = Omit<Complete<components["schemas"]["PrecheckResponse"]>, "candidate" | "accepted" | "check" | "room" | "operation_outcome"> & {
  candidate: SubmissionCheckVersion | null;
  accepted: AcceptedSubmissionCheckVersion | null;
  check: CheckState | null;
  room: Complete<components["schemas"]["PrecheckRoomResponse"]>;
  operation_outcome: Complete<components["schemas"]["PrecheckOutcomeResponse"]> | null;
};
export type StartSubmissionCheckBody = Complete<components["schemas"]["CreatePrecheckRequest"]>;
type Mutation = Complete<components["schemas"]["PrecheckMutationRequest"]>;
export type SubmissionCheckCommand = Pick<Mutation, "request_id" | "expected_revision" | "expected_check_version"> & Partial<Pick<Mutation, "question_id" | "choice_id" | "direct_text">>;
