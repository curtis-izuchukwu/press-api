type Difficulty = "easy" | "medium" | "hard";
type WorksheetFormat = "short-answer" | "multiple-choice" | "mixed";

type GenerateRequest = {
  subject?: string;
  topic?: string;
  difficulty?: Difficulty;
  questionCount?: number;
  format?: WorksheetFormat;
};

type WorksheetQuestion = {
  id: number;
  type: "short-answer";
  question: string;
  answer: string;
  markScheme: string[];
  marks: number;
};

type WorksheetResponse = {
  metadata: {
    service: "FlightDeck API";
    version: "0.1.0";
    subject: string;
    topic: string;
    difficulty: Difficulty;
    questionCount: number;
    format: WorksheetFormat;
    generatedAt: string;
    mode: "static";
  };
  questions: WorksheetQuestion[];
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

async function handleGenerate(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("Use POST /generate");
  }

  let body: GenerateRequest;

  try {
    body = await request.json<GenerateRequest>();
  } catch {
    return jsonResponse(
      {
        error: "Bad Request",
        message: "Request body must be valid JSON"
      },
      400
    );
  }

  const subject = body.subject ?? "Computer Science";
  const topic = body.topic ?? "Algorithms";
  const difficulty = body.difficulty ?? "medium";
  const questionCount = body.questionCount ?? 3;
  const format = body.format ?? "short-answer";

  const questions: WorksheetQuestion[] = Array.from(
    { length: questionCount },
    (_, index) => ({
      id: index + 1,
      type: "short-answer",
      question: `Explain one key idea about ${topic}.`,
      answer: `A good answer should describe a core concept from ${topic} in the context of ${subject}.`,
      markScheme: [
        `Identifies a relevant concept from ${topic}.`,
        "Explains the concept clearly.",
        `Links the explanation to ${subject}.`
      ],
      marks: 3
    })
  );

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
      mode: "static"
    },
    questions
  };

  return jsonResponse(response);
}

export default {
  async fetch(request: Request): Promise<Response> {
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
      return handleGenerate(request);
    }

    return notFound();
  }
};