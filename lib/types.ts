export type SurveyStatus = "draft" | "published" | "closed";
export type QuestionType = "short_text" | "long_text" | "single_choice" | "multiple_choice" | "dropdown" | "scale" | "rating" | "yes_no";

export type SurveyQuestion = {
  id: string;
  prompt: string;
  type: QuestionType;
  required: boolean;
  position: number;
  options: string[];
  config: { min?: number; max?: number; minLabel?: string; maxLabel?: string };
};

export type Survey = {
  id: string;
  ownerEmail?: string;
  title: string;
  description: string;
  status: SurveyStatus;
  slug: string;
  isAnonymous: boolean;
  collectName: boolean;
  collectEmail: boolean;
  oneResponsePerDevice: boolean;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
  responseCount?: number;
  questions: SurveyQuestion[];
};

export type SurveyInput = Pick<Survey, "title" | "description" | "isAnonymous" | "collectName" | "collectEmail" | "oneResponsePerDevice" | "startAt" | "endAt" | "questions">;
export type AnswerInput = { questionId: string; value: string | string[] | number };
export type ResultsChoice = { label: string; count: number; percentage: number };
export type QuestionResult = { questionId: string; prompt: string; type: QuestionType; totalAnswered: number; choices: ResultsChoice[]; textAnswers: string[] };
export type ResultsPayload = {
  survey: Omit<Survey, "questions"> & { questionCount: number };
  responseCount: number;
  responsesLast24Hours: number;
  lastResponseAt: string | null;
  timeline: Array<{ date: string; count: number }>;
  questions: QuestionResult[];
  rawResponses: Array<{ id: string; respondentName: string | null; respondentEmail: string | null; submittedAt: string; answers: Record<string, string | string[] | number> }>;
};
