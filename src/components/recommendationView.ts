// Presentation values only. The server's native OpenAPI supplies the API contract.
export interface RecommendationVariantView {
  id: string;
  startAt: string;
  endAt: string;
  attendanceCount: number;
  totalParticipants: number;
  meetingMode: "IN_PERSON" | "REMOTE";
  place: string | null;
}

export interface RecommendationOptionView {
  id: string;
  rank: number;
  variants: RecommendationVariantView[];
}

export interface RecommendationSelection {
  optionId: string;
  variantId: string;
  startAt: string;
  endAt: string;
}
