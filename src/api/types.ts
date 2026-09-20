import type { components } from "./schema";

type Complete<T> = { [K in keyof T]-?: Exclude<T[K], undefined> };

type RawRoom = components["schemas"]["RoomResponse"];
type RawViewer = components["schemas"]["ViewerParticipationResponse"];
type RawCandidate = components["schemas"]["CandidateResponse"];
type RawCandidateList = components["schemas"]["CandidateListResponse"];
type RawResult = components["schemas"]["ConfirmedResultResponse"];
type RawSubmission = components["schemas"]["SubmissionResponse"];

export type MeetingMode = "IN_PERSON" | "REMOTE" | "EITHER";
export type PublicStatus = "COLLECTING" | "ANALYZING" | "INSUFFICIENT_PARTICIPANTS" | "ANALYSIS_DELAYED" | "NO_MATCH" | "READY" | "READY_WITH_WARNINGS" | "CONFIRMED";
export type Viewer = Complete<RawViewer>;
export type Room = Omit<Complete<RawRoom>, "viewer"> & { viewer: Viewer };
export type ManualAvailability = Complete<components["schemas"]["ManualAvailabilityDto"]>;
export type Submission = Omit<Complete<RawSubmission>, "manual_available_times"> & { manual_available_times: ManualAvailability[] };
export type Candidate = Omit<Complete<RawCandidate>, "time_ranges" | "place"> & {
  time_ranges: Complete<components["schemas"]["CandidateTimeRangeResponse"]>[];
  place: Complete<components["schemas"]["CandidatePlaceResponse"]> | null;
};
export type CandidateList = Omit<Complete<RawCandidateList>, "candidates"> & { candidates: Candidate[] };
export type ConfirmedResult = Omit<Complete<RawResult>, "candidate"> & { candidate: Candidate };
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

export interface SaveSubmissionBody {
  raw_text: string | null;
  manual_available_times: ManualAvailability[];
}
