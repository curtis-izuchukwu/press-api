import { z } from "zod";

export const difficultySchema = z.enum(["easy", "medium", "hard"]);

export const worksheetFormatSchema = z.enum([
  "short-answer",
  "multiple-choice",
  "mixed"
]);

export const generateRequestSchema = z.object({
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(1).max(120),
  difficulty: difficultySchema.default("medium"),
  questionCount: z.number().int().min(1).max(10).default(3),
  format: worksheetFormatSchema.default("short-answer")
});

export type Difficulty = z.infer<typeof difficultySchema>;
export type WorksheetFormat = z.infer<typeof worksheetFormatSchema>;
export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export type WorksheetQuestion = {
  id: number;
  type: "short-answer";
  question: string;
  answer: string;
  markScheme: string[];
  marks: number;
};

export type WorksheetResponse = {
  metadata: {
    service: "FlightDeck API";
    version: "0.1.0";
    subject: string;
    topic: string;
    difficulty: Difficulty;
    questionCount: number;
    format: WorksheetFormat;
    generatedAt: string;
    academicLevel: "undergraduate";
    mode: "static" | "ai" | "mixed";  };
  questions: WorksheetQuestion[];
};