import type { components, paths } from "./schema";

export type Complete<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

type RawRoom = components["schemas"]["RoomResponse"];
type RawViewer = components["schemas"]["ViewerParticipationResponse"];
type RawCandidate = components["schemas"]["CandidateResponse"];
type RawCandidateList = components["schemas"]["CandidateListResponse"];
type RawResult = components["schemas"]["ConfirmedResultResponse"];
type RawSubmission = components["schemas"]["SubmissionResponse"];
type RawSavedSubmission = components["schemas"]["SavedSubmissionResponse"];

export type MeetingMode = "IN_PERSON" | "REMOTE" | "EITHER";
export type PublicStatus = "COLLECTING" | "ANALYZING" | "INSUFFICIENT_PARTICIPANTS" | "ANALYSIS_DELAYED" | "NO_MATCH" | "READY" | "READY_WITH_WARNINGS" | "CONFIRMED";
// Additive read fields may be absent while the web is served with the previous server.
// DTO members remain generated; only their backward-read presence is relaxed here.
type RecoveryKeys = "state_version" | "analysis_id" | "revision_generation" | "revision_round" | "remaining_correction_analyses" | "capabilities" | "recommendation_protocol";
type SubmissionKeys = "revision_round_id" | "state_version";
export type Viewer = Omit<Complete<RawViewer>, "context_id"> & Partial<Pick<Complete<RawViewer>, "context_id">>;
export type RevisionRound = Complete<components["schemas"]["RevisionRoundResponse"]>;
export type RoomCapabilities = Complete<components["schemas"]["RoomCapabilitiesResponse"]>;
export type Room = Omit<Complete<RawRoom>, "viewer" | RecoveryKeys> & {
  viewer: Viewer;
  capabilities?: RoomCapabilities;
} & Partial<Pick<Complete<RawRoom>, Exclude<RecoveryKeys, "capabilities">>>;
export type Submission = Omit<Complete<RawSubmission>, "manual_available_times" | SubmissionKeys> & Partial<Pick<Complete<RawSubmission>, SubmissionKeys>>;
export type SavedSubmission = Omit<Complete<RawSavedSubmission>, "manual_available_times" | SubmissionKeys> & Partial<Pick<Complete<RawSavedSubmission>, SubmissionKeys>>;
export type Candidate = Omit<Complete<RawCandidate>, "time_ranges" | "place"> & {
  time_ranges: Complete<components["schemas"]["CandidateTimeRangeResponse"]>[];
  place: Complete<components["schemas"]["CandidatePlaceResponse"]> | null;
};
export type CandidateList = Omit<Complete<RawCandidateList>, "candidates" | "analysis_id" | "state_version"> & { candidates: Candidate[] } & Partial<Pick<Complete<RawCandidateList>, "analysis_id" | "state_version">>;
export type RecommendationSelection = Complete<components["schemas"]["RecommendationSelectionResponse"]>;
export type ConfirmedResult = Omit<Complete<RawResult>, "candidate" | "selection"> & { candidate: Candidate; selection?: RecommendationSelection | null };
export type RecommendationVariant = components["schemas"]["RecommendationVariantResponse"];
export type RecommendationOption = Omit<components["schemas"]["RecommendationOptionResponse"], "time_range"> & { time_range: Complete<components["schemas"]["CandidateTimeRangeResponse"]> };
export type RecommendationList = Omit<components["schemas"]["RecommendationListResponse"], "options"> & { options: RecommendationOption[] };
export type RecommendationConfirmationBody = components["schemas"]["RecommendationConfirmationRequest"];
export type RecommendationAlternativeQuery = NonNullable<paths["/api/rooms/{inviteCode}/recommendations/alternatives"]["get"]["parameters"]["query"]>;
export type UnappliedInput = Complete<components["schemas"]["UnappliedInputResponse"]>;
export type ApiProblem = Complete<components["schemas"]["ApiProblemSchema"]>;

export interface CreateRoomBody {
  purpose: string;
  meeting_mode: MeetingMode;
  host_display_name: string;
  expected_participants: number | null;
  submission_deadline: string | null;
  manual_only: boolean;
  search_start_date: string | null;
  search_end_date: string | null;
}

export type SaveSubmissionBody = Pick<components["schemas"]["SaveSubmissionRequest"], "raw_text" | "revision_round_id" | "expected_revision">;
