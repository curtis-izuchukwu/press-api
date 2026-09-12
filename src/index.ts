import {
  generateRequestSchema,
  type WorksheetQuestion,
  type WorksheetResponse
} from "./schemas/generate";

type WorksheetHistoryRow = {
  id: string;
  subject: string;
  topic: string;
  difficulty: string;
  question_count: number;
  format: string;
  academic_level: string;
  mode: string;
  cache_status: string;
  created_at: string;
};

const GENERATE_RATE_LIMIT_MAX_REQUESTS = 10;
const GENERATE_RATE_LIMIT_WINDOW_SECONDS = 60;

async function handleHistory(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("Use GET /history");
  }

  const result = await env.DB.prepare(
    `
    SELECT
      id,
      subject,
      topic,
      difficulty,
      question_count,
      format,
      academic_level,
      mode,
      cache_status,
      created_at
    FROM worksheets
    ORDER BY created_at DESC
    LIMIT 20
    `
  ).all<WorksheetHistoryRow>();

  return jsonResponse({
    metadata: {
      service: "Press API",
      version: "0.1.0",
      count: result.results.length
    },
    worksheets: result.results
  });
}

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
      message: "Press API route not found"
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

function isPlaceholderText(value: string): boolean {
  const normalised = value.trim().toLowerCase();

  return (
    normalised === "string" ||
    normalised === "answer" ||
    normalised === "question" ||
    normalised === "n/a" ||
    normalised === "placeholder"
  );
}

function getFormatSettings(format: string): {
  marks: number;
  markSchemeLength: number;
  answerRule: string;
  markSchemeRule: string;
} {
  if (format === "long-answer") {
    return {
      marks: 8,
      markSchemeLength: 5,
      answerRule:
        "The answer must be one developed academic paragraph of 3 to 5 sentences.",
      markSchemeRule:
        "The markScheme must contain exactly 5 marking points covering explanation, evidence, analysis, comparison, and conclusion."
    };
  }

  return {
    marks: 3,
    markSchemeLength: 3,
    answerRule: "The answer must be one concise academic sentence.",
    markSchemeRule: "The markScheme must contain exactly 3 short marking points."
  };
}

function isWorksheetQuestion(value: unknown): value is WorksheetQuestion {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const question = value as WorksheetQuestion;
  const validType =
    question.type === "short-answer" || question.type === "long-answer";
  const settings = validType ? getFormatSettings(question.type) : null;

  return (
    typeof question.id === "number" &&
    validType &&
    typeof question.question === "string" &&
    question.question.trim().length > 0 &&
    !isPlaceholderText(question.question) &&
    typeof question.answer === "string" &&
    question.answer.trim().length > 0 &&
    !isPlaceholderText(question.answer) &&
    Array.isArray(question.markScheme) &&
    question.markScheme.length === settings!.markSchemeLength &&
    question.markScheme.every(
      (point) =>
        typeof point === "string" &&
        point.trim().length > 0 &&
        !isPlaceholderText(point)
    ) &&
    question.marks === settings!.marks
  );
}

function createFallbackQuestions(
  subject: string,
  topic: string,
  questionCount: number,
  format = "short-answer"
): WorksheetQuestion[] {
  const fallbackQuestionTemplates =
    format === "long-answer"
      ? [
          {
            question: `Evaluate how ${topic} works and why it matters in ${subject}.`,
            answer: `${topic} matters in ${subject} because it provides a structured way to reason about a problem, apply core principles, and communicate a solution with precision. A strong answer should explain the underlying mechanism, identify the assumptions that make it work, and connect those details to practical use. It should also acknowledge limitations or trade-offs rather than treating the technique as universally appropriate.`,
            markScheme: [
              `Explains the core mechanism of ${topic}.`,
              `Connects ${topic} to a relevant ${subject} context.`,
              "Uses accurate undergraduate-level terminology.",
              "Analyses at least one limitation or trade-off.",
              "Draws a clear conclusion about its value."
            ]
          },
          {
            question: `Discuss the conditions under which ${topic} is an appropriate technique in ${subject}.`,
            answer: `An effective answer should show that ${topic} is useful when its assumptions match the structure of the problem being solved. It should explain what those assumptions are, why they affect correctness or efficiency, and how the technique compares with a simpler approach. The discussion should make clear that choosing ${topic} is a design decision rather than a default choice.`,
            markScheme: [
              `Identifies conditions required for ${topic} to be appropriate.`,
              "Explains why those conditions affect performance or correctness.",
              "Compares the technique with a simpler alternative.",
              "Uses a concrete example or scenario.",
              "Justifies the final judgement clearly."
            ]
          },
          {
            question: `Analyse the main trade-offs involved in using ${topic}.`,
            answer: `A developed answer should explain both the strengths and costs of using ${topic} in a realistic ${subject} setting. It should describe the benefit the technique offers, the constraints it introduces, and the situations where those constraints may outweigh the benefit. The answer should finish by linking the trade-off back to problem size, data structure, implementation complexity, or maintainability.`,
            markScheme: [
              `States a meaningful advantage of ${topic}.`,
              "Explains a constraint, cost, or limitation.",
              "Relates the trade-off to a realistic use case.",
              "Shows balanced analysis rather than one-sided description.",
              "Links the judgement to an undergraduate-level concept."
            ]
          }
        ]
      : [
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

  const settings = getFormatSettings(format);

  return Array.from({ length: questionCount }, (_, index) => {
    const template =
      fallbackQuestionTemplates[index % fallbackQuestionTemplates.length];

    return {
      id: index + 1,
      type: format === "long-answer" ? "long-answer" : "short-answer",
      question: template.question,
      answer: template.answer,
      markScheme: template.markScheme,
      marks: settings.marks
    };
  });
}

function createFallbackQuestion(
  subject: string,
  topic: string,
  id: number,
  format = "short-answer"
): WorksheetQuestion {
  const fallbackQuestions = createFallbackQuestions(subject, topic, id, format);
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
  const settings = getFormatSettings(options.format);

  const prompt = `
You are generating one undergraduate revision question.

Return a single JSON object only.
Do not include markdown, comments, code fences, explanations, or extra text.

The JSON object must use this exact shape:
{
  "question": {
    "id": ${options.id},
    "type": "${options.format}",
    "question": "string",
    "answer": "string",
    "markScheme": ${JSON.stringify(Array.from({ length: settings.markSchemeLength }, () => "string"))},
    "marks": ${settings.marks}
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
- ${settings.answerRule}
- ${settings.markSchemeRule}
- The marks value must be ${settings.marks}.
- Avoid generic repeated questions such as only asking for the time complexity.
- Do not use placeholder values such as "string", "answer", "question", or empty text.
- The answer must directly answer the generated question.
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
    type: options.format === "long-answer" ? "long-answer" : "short-answer",
    marks: settings.marks
  };
}

async function createCacheKey(input: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `generate:${hash}`;
}

function createWorksheetId(): string {
  return crypto.randomUUID();
}

async function persistWorksheet(
  env: Env,
  response: WorksheetResponse
): Promise<void> {
  const worksheetId = createWorksheetId();

  await env.DB.prepare(
    `
    INSERT INTO worksheets (
      id,
      subject,
      topic,
      difficulty,
      question_count,
      format,
      academic_level,
      mode,
      cache_status,
      response_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      worksheetId,
      response.metadata.subject,
      response.metadata.topic,
      response.metadata.difficulty,
      response.metadata.questionCount,
      response.metadata.format,
      response.metadata.academicLevel,
      response.metadata.mode,
      response.metadata.cache ?? "miss",
      JSON.stringify(response),
      response.metadata.generatedAt
    )
    .run();
}

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

function getClientIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For") ??
    "unknown"
  );
}

async function checkRateLimit(
  env: Env,
  options: {
    key: string;
    limit: number;
    windowSeconds: number;
  }
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = now + options.windowSeconds * 1000;

  const existingState = await env.PRESS_API_CACHE.get<RateLimitState>(
    options.key,
    "json"
  );

  if (!existingState || existingState.resetAt <= now) {
    const newState: RateLimitState = {
      count: 1,
      resetAt
    };

    await env.PRESS_API_CACHE.put(options.key, JSON.stringify(newState), {
      expirationTtl: options.windowSeconds
    });

    return {
      allowed: true,
      limit: options.limit,
      remaining: options.limit - 1,
      resetAt
    };
  }

  if (existingState.count >= options.limit) {
    return {
      allowed: false,
      limit: options.limit,
      remaining: 0,
      resetAt: existingState.resetAt
    };
  }

  const updatedState: RateLimitState = {
    count: existingState.count + 1,
    resetAt: existingState.resetAt
  };

  const remainingWindowSeconds = Math.ceil(
    (existingState.resetAt - now) / 1000
  );

  await env.PRESS_API_CACHE.put(options.key, JSON.stringify(updatedState), {
    expirationTtl: Math.max(60, remainingWindowSeconds)
  });

  return {
    allowed: true,
    limit: options.limit,
    remaining: options.limit - updatedState.count,
    resetAt: existingState.resetAt
  };
}

function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
      rateLimit: {
        limit: result.limit,
        remaining: result.remaining,
        resetAt: new Date(result.resetAt).toISOString()
      }
    },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": Math.ceil(
          (result.resetAt - Date.now()) / 1000
        ).toString(),
        "X-RateLimit-Limit": result.limit.toString(),
        "X-RateLimit-Remaining": result.remaining.toString(),
        "X-RateLimit-Reset": new Date(result.resetAt).toISOString()
      }
    }
  );
}

async function handleGenerate(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("Use POST /generate");
  }

  const clientIp = getClientIp(request);
  const rateLimitKey = `rate-limit:generate:${clientIp}`;

  const rateLimit = await checkRateLimit(env, {
    key: rateLimitKey,
    limit: GENERATE_RATE_LIMIT_MAX_REQUESTS,
    windowSeconds: GENERATE_RATE_LIMIT_WINDOW_SECONDS
  });

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit);
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

  const cacheKey = await createCacheKey({
    subject,
    topic,
    difficulty,
    questionCount,
    format,
    academicLevel: "undergraduate",
    version: "0.1.0"
  });

  const cachedResponse = (await env.PRESS_API_CACHE.get(
    cacheKey,
    "json"
  )) as WorksheetResponse | null;

  if (cachedResponse && cachedResponse.metadata.mode !== "static") {
    return jsonResponse({
      ...cachedResponse,
      metadata: {
        ...cachedResponse.metadata,
        cache: "hit"
      }
    });
  }

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
  let aiQuestionCount = 0;

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
      aiQuestionCount += 1;
    } catch (error) {
      console.error(
        `Workers AI generation failed for question ${index + 1}:`,
        error
      );

      questions.push(createFallbackQuestion(subject, topic, index + 1, format));
    }
  }

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
      service: "Press API",
      version: "0.1.0",
      subject,
      topic,
      difficulty,
      questionCount,
      format,
      generatedAt: new Date().toISOString(),
      academicLevel: "undergraduate",
      mode,
      cache: "miss"
    },
    questions
  };

  if (mode !== "static") {
    await env.PRESS_API_CACHE.put(cacheKey, JSON.stringify(response), {
      expirationTtl: 60 * 60
    });
  }

  try {
    await persistWorksheet(env, response);
  } catch (error) {
    console.error("D1 persistence failed:", error);
  }

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
        service: "Press API",
        version: "0.1.0"
      });
    }

    if (url.pathname === "/generate") {
      return handleGenerate(request, env);
    }

    if (url.pathname === "/history") {
      return handleHistory(request, env);
    }

    if (
      request.method === "GET" &&
      [
        "/",
        "/index.html",
        "/styles.css",
        "/app.js",
        "/favicon.ico",
        "/favicon-32x32.png",
        "/favicon-48x48.png",
        "/apple-touch-icon.png",
        "/icon-192x192.png",
        "/icon-512x512.png",
        "/press-icon.png",
        "/site.webmanifest"
      ].includes(url.pathname)
    ) {
      return env.ASSETS.fetch(request);
    }

    return notFound();
  }
} satisfies ExportedHandler<Env>;
