import {
  generateRequestSchema,
  type WorksheetQuestion,
  type WorksheetResponse
} from "./schemas/generate";

type WorkersAiTextResponse = {
  response?: string;
};

type AiBinding = {
  run(
    model: string,
    input: {
      prompt: string;
      max_tokens?: number;
      temperature?: number;
    }
  ): Promise<WorkersAiTextResponse>;
};

export type Env = {
  AI: AiBinding;
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

function notFound(): Response {
  return jsonResponse(
    {
      error: "Not Found",
      message: "FlightDeck API route not found"
    },
    404
  );
}

function methodNotAllowed(message: string): Response {
  return jsonResponse(
    {
      error: "Method Not Allowed",
      message
    },
    405
  );
}

function extractFirstJsonObject(text: string): string {
  const firstBrace = text.indexOf("{");

  if (firstBrace === -1) {
    throw new Error("No JSON object found in AI response");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = firstBrace; index < text.length; index++) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth++;
    }

    if (char === "}") {
      depth--;

      if (depth === 0) {
        return text.slice(firstBrace, index + 1);
      }
    }
  }

  throw new Error("AI response contained incomplete JSON");
}

function isWorksheetQuestion(value: unknown): value is WorksheetQuestion {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const question = value as WorksheetQuestion;

  return (
    typeof question.id === "number" &&
    question.type === "short-answer" &&
    typeof question.question === "string" &&
    question.question.trim().length > 0 &&
    typeof question.answer === "string" &&
    question.answer.trim().length > 0 &&
    Array.isArray(question.markScheme) &&
    question.markScheme.length === 3 &&
    question.markScheme.every(
      (point) => typeof point === "string" && point.trim().length > 0
    ) &&
    question.marks === 3
  );
}

function createFallbackQuestions(
  subject: string,
  topic: string,
  questionCount: number
): WorksheetQuestion[] {
  const fallbackQuestionTemplates = [
    {
      question: `Explain how ${topic} works at a conceptual level.`,
      answer: `A strong answer should describe the main mechanism of ${topic} using precise ${subject} terminology.`,
      markScheme: [
        `Identifies the core mechanism behind ${topic}.`,
        "Explains the process using accurate academic language.",
        `Links the explanation to a relevant ${subject} context.`
      ]
    },
    {
      question: `Analyse why ${topic} is useful in ${subject}.`,
      answer: `A strong answer should explain the practical or theoretical value of ${topic} within ${subject}.`,
      markScheme: [
        `States a relevant use or advantage of ${topic}.`,
        "Explains why that advantage matters.",
        `Connects the analysis to undergraduate-level ${subject}.`
      ]
    },
    {
      question: `Compare ${topic} with a simpler alternative approach.`,
      answer: `A strong answer should identify a simpler alternative and explain the trade-offs involved.`,
      markScheme: [
        "Identifies a valid alternative approach.",
        `Compares the alternative with ${topic}.`,
        "Explains at least one meaningful trade-off."
      ]
    }
  ];

  return Array.from({ length: questionCount }, (_, index) => {
    const template =
      fallbackQuestionTemplates[index % fallbackQuestionTemplates.length];

    return {
      id: index + 1,
      type: "short-answer",
      question: template.question,
      answer: template.answer,
      markScheme: template.markScheme,
      marks: 3
    };
  });
}

function createFallbackQuestion(
  subject: string,
  topic: string,
  id: number
): WorksheetQuestion {
  const fallbackQuestions = createFallbackQuestions(subject, topic, id);
  return fallbackQuestions[id - 1];
}

async function generateAiQuestion(
  env: Env,
  options: {
    id: number;
    subject: string;
    topic: string;
    difficulty: string;
    format: string;
    angle: string;
  }
): Promise<WorksheetQuestion> {
  const prompt = `
You are generating one undergraduate revision question.

Return a single JSON object only.
Do not include markdown, comments, code fences, explanations, or extra text.

The JSON object must use this exact shape:
{
  "question": {
    "id": ${options.id},
    "type": "short-answer",
    "question": "string",
    "answer": "string",
    "markScheme": ["string", "string", "string"],
    "marks": 3
  }
}

Rules:
- Subject: ${options.subject}
- Topic: ${options.topic}
- Difficulty: ${options.difficulty}
- Format: ${options.format}
- Question focus: ${options.angle}
- The question must be suitable for undergraduate university degree study.
- The question must specifically match the question focus.
- The answer must be one concise academic sentence.
- The markScheme must contain exactly 3 short marking points.
- The marks value must be 3.
- Avoid generic repeated questions such as only asking for the time complexity.
`;

  const aiResult = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
    prompt,
    max_tokens: 350,
    temperature: 0.2
  });

  const aiText = aiResult.response ?? "";

  const jsonText = extractFirstJsonObject(aiText);

  const parsed = JSON.parse(jsonText) as {
    question?: unknown;
  };

  if (!isWorksheetQuestion(parsed.question)) {
    throw new Error("AI response did not contain a valid worksheet question");
  }

  return {
    ...parsed.question,
    id: options.id,
    type: "short-answer",
    marks: 3
  };
}

async function handleGenerate(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("Use POST /generate");
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(
      {
        error: "Bad Request",
        message: "Request body must be valid JSON"
      },
      400
    );
  }

  const parsedBody = generateRequestSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return jsonResponse(
      {
        error: "Validation Error",
        message: "Request body does not match the expected generate format",
        issues: parsedBody.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message
        }))
      },
      400
    );
  }

  const { subject, topic, difficulty, questionCount, format } = parsedBody.data;

  const questionAngles = [
    "conceptual understanding",
    "algorithmic reasoning",
    "comparison with an alternative approach",
    "complexity analysis",
    "practical application",
    "edge cases and limitations",
    "correctness reasoning",
    "trade-off analysis"
  ];

  const questions: WorksheetQuestion[] = [];

  for (let index = 0; index < questionCount; index++) {
    try {
      const question = await generateAiQuestion(env, {
        id: index + 1,
        subject,
        topic,
        difficulty,
        format,
        angle: questionAngles[index % questionAngles.length]
      });

      questions.push(question);
    } catch (error) {
      console.error(
        `Workers AI generation failed for question ${index + 1}:`,
        error
      );

      questions.push(createFallbackQuestion(subject, topic, index + 1));
    }
  }

  const aiQuestionCount = questions.filter(
    (question) =>
      !question.question.startsWith("Explain how") &&
      !question.question.startsWith("Analyse why") &&
      !question.question.startsWith("Compare")
  ).length;

  let mode: "static" | "ai" | "mixed";

  if (aiQuestionCount === 0) {
    mode = "static";
  } else if (aiQuestionCount === questionCount) {
    mode = "ai";
  } else {
    mode = "mixed";
  }

  const response: WorksheetResponse = {
    metadata: {
      service: "FlightDeck API",
      version: "0.1.0",
      subject,
      topic,
      difficulty,
      questionCount,
      format,
      generatedAt: new Date().toISOString(),
      academicLevel: "undergraduate",
      mode
    },
    questions
  };

  return jsonResponse(response);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET") {
        return methodNotAllowed("Use GET /health");
      }

      return jsonResponse({
        status: "ok",
        service: "FlightDeck API",
        version: "0.1.0"
      });
    }

    if (url.pathname === "/generate") {
      return handleGenerate(request, env);
    }

    return notFound();
  }
};