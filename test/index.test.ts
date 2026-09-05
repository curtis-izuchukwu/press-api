import { beforeEach, describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import type { WorksheetResponse } from "../src/schemas/generate";

type ErrorResponse = {
  error: string;
  message?: string;
};

type ValidationErrorResponse = ErrorResponse & {
  issues: Array<{
    field: string;
    message: string;
  }>;
};

const cacheStore = new Map<string, string>();
const persistedWorksheets: unknown[] = [];

beforeEach(() => {
  cacheStore.clear();
  persistedWorksheets.length = 0;
});

const mockEnv = {
  AI: {
    run: async () => ({
      response: JSON.stringify({
        question: {
          id: 1,
          type: "short-answer",
          question: "What is binary search?",
          answer:
            "Binary search is an algorithm that repeatedly halves a sorted search space.",
          markScheme: [
            "Mentions sorted data.",
            "Mentions halving the search space.",
            "Explains the purpose of finding a target value."
          ],
          marks: 3
        }
      })
    })
  },

  FLIGHTDECK_CACHE: {
    get: async (key: string) => {
      const value = cacheStore.get(key);
      return value ? JSON.parse(value) : null;
    },
    put: async (key: string, value: string) => {
      cacheStore.set(key, value);
    }
  },

  DB: {
    prepare: () => ({
      bind: (...values: unknown[]) => ({
        run: async () => {
          persistedWorksheets.push(values);

          return {
            success: true,
            meta: {}
          };
        }
      }),
      all: async () => ({
        results: [],
        success: true,
        meta: {}
      })
    })
  }
} as unknown as Env;

describe("FlightDeck API", () => {
  it("returns health status", async () => {
    const request = new Request("http://example.com/health", {
      method: "GET"
    });

    const response = await worker.fetch(request, mockEnv);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "FlightDeck API",
      version: "0.1.0"
    });
  });

  it("returns 404 for unknown routes", async () => {
    const request = new Request("http://example.com/unknown", {
      method: "GET"
    });

    const response = await worker.fetch(request, mockEnv);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      error: "Not Found",
      message: "FlightDeck API route not found"
    });
  });

  it("generates a worksheet response", async () => {
    const request = new Request("http://example.com/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.1"
      },
      body: JSON.stringify({
        subject: "Computer Science",
        topic: "Binary Search",
        difficulty: "medium",
        questionCount: 3,
        format: "short-answer"
      })
    });

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as WorksheetResponse;

    expect(response.status).toBe(200);
    expect(body.metadata.service).toBe("FlightDeck API");
    expect(body.metadata.subject).toBe("Computer Science");
    expect(body.metadata.topic).toBe("Binary Search");
    expect(body.metadata.difficulty).toBe("medium");
    expect(body.metadata.questionCount).toBe(3);
    expect(body.metadata.format).toBe("short-answer");
    expect(body.metadata.academicLevel).toBe("undergraduate");
    expect(body.metadata.mode).toBe("ai");
    expect(body.questions).toHaveLength(3);
    expect(body.questions[0]).toMatchObject({
      id: 1,
      type: "short-answer",
      marks: 3
    });
  });

  it("generates long-answer worksheet questions", async () => {
    const longAnswerEnv = {
      ...mockEnv,
      AI: {
        run: async () => ({
          response: JSON.stringify({
            question: {
              id: 1,
              type: "long-answer",
              question:
                "Evaluate the role of binary search in efficient algorithm design.",
              answer:
                "Binary search is important because it reduces the search space by half after each comparison, which gives it logarithmic time complexity on sorted data. This makes it substantially more efficient than linear search for large datasets. However, it depends on the data being sorted and can be less appropriate when insertion order changes frequently. A strong implementation choice therefore depends on the structure and stability of the data.",
              markScheme: [
                "Explains the halving process.",
                "Connects the method to logarithmic time complexity.",
                "States the sorted-data requirement.",
                "Compares the approach with a simpler alternative.",
                "Evaluates when the technique is appropriate."
              ],
              marks: 8
            }
          })
        })
      }
    } as unknown as Env;

    const request = new Request("http://example.com/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": "127.0.0.2"
      },
      body: JSON.stringify({
        subject: "Computer Science",
        topic: "Binary Search",
        difficulty: "medium",
        questionCount: 2,
        format: "long-answer"
      })
    });

    const response = await worker.fetch(request, longAnswerEnv);
    const body = (await response.json()) as WorksheetResponse;

    expect(response.status).toBe(200);
    expect(body.metadata.format).toBe("long-answer");
    expect(body.metadata.mode).toBe("ai");
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toMatchObject({
      type: "long-answer",
      marks: 8
    });
    expect(body.questions[0].markScheme).toHaveLength(5);
  });

  it("rejects invalid generate input", async () => {
    const request = new Request("http://example.com/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subject: "",
        topic: "",
        difficulty: "impossible",
        questionCount: 50,
        format: "essay"
      })
    });

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation Error");
    expect(body.message).toBe("Request body does not match the expected generate format");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects removed worksheet formats", async () => {
    const request = new Request("http://example.com/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subject: "Computer Science",
        topic: "Binary Search",
        difficulty: "medium",
        questionCount: 3,
        format: "multiple-choice"
      })
    });

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation Error");
  });

  it("rejects GET requests to generate", async () => {
    const request = new Request("http://example.com/generate", {
      method: "GET"
    });

    const response = await worker.fetch(request, mockEnv);
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(405);
    expect(body).toEqual({
      error: "Method Not Allowed",
      message: "Use POST /generate"
    });
  });

  it("does not cache static fallback responses", async () => {
    const staticFallbackEnv = {
      ...mockEnv,
      AI: {
        run: async () => {
          throw new Error("AI unavailable");
        }
      }
    } as unknown as Env;

    const requestBody = {
      subject: "Computer Science",
      topic: "Binary Search",
      difficulty: "medium",
      questionCount: 3,
      format: "short-answer"
    };

    const createRequest = () =>
      new Request("http://example.com/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "198.51.100.20"
        },
        body: JSON.stringify(requestBody)
      });

    const firstResponse = await worker.fetch(createRequest(), staticFallbackEnv);
    const firstBody = (await firstResponse.json()) as WorksheetResponse;
    const secondResponse = await worker.fetch(createRequest(), staticFallbackEnv);
    const secondBody = (await secondResponse.json()) as WorksheetResponse;

    expect(firstBody.metadata.mode).toBe("static");
    expect(firstBody.metadata.cache).toBe("miss");
    expect(secondBody.metadata.mode).toBe("static");
    expect(secondBody.metadata.cache).toBe("miss");
  });

  it("rate limits generate requests", async () => {
    const requestBody = {
      subject: "Computer Science",
      topic: "Binary Search",
      difficulty: "medium",
      questionCount: 3,
      format: "short-answer"
    };

    let lastResponse: Response | undefined;

    for (let index = 0; index < 11; index++) {
      const request = new Request("http://example.com/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.10"
        },
        body: JSON.stringify(requestBody)
      });

      lastResponse = await worker.fetch(request, mockEnv);
    }

    const body = (await lastResponse!.json()) as ErrorResponse;

    expect(lastResponse!.status).toBe(429);
    expect(body.error).toBe("Too Many Requests");
  });
});
