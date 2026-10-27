import type { components } from "./schema";
import type { Complete, Submission } from "./types";

export type ClarificationQuestion = Complete<components["schemas"]["ClarificationQuestionResponse"]>;
export type ClarificationList = Omit<Complete<components["schemas"]["ClarificationListResponse"]>, "questions"> & { questions: ClarificationQuestion[] };
export type ClarificationAnswer = Omit<Complete<components["schemas"]["AnswerClarificationRequest"]>, "direct_text"> & { direct_text?: string };
export type ClarificationAnswerResult = Omit<Complete<components["schemas"]["ClarificationAnswerResponse"]>, "submission"> & { submission: Submission | null };
