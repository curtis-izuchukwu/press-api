import { describe, expect, it } from "vitest";
import worker from "../src/index";
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

describe("FlightDeck API", () => {
  it("returns health status", async () => {
    const request = new Request("http://example.com/health", {
      method: "GET"
    });

    const response = await worker.fetch(request);
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

    const response = await worker.fetch(request);
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        subject: "Computer Science",
        topic: "Binary Search",
        difficulty: "medium",
        questionCount: 3,
        format: "short-answer"
      })
    });

    const response = await worker.fetch(request);
    const body = (await response.json()) as WorksheetResponse;

    expect(response.status).toBe(200);
    expect(body.metadata.service).toBe("FlightDeck API");
    expect(body.metadata.subject).toBe("Computer Science");
    expect(body.metadata.topic).toBe("Binary Search");
    expect(body.metadata.difficulty).toBe("medium");
    expect(body.metadata.questionCount).toBe(3);
    expect(body.metadata.format).toBe("short-answer");
    expect(body.metadata.mode).toBe("static");
    expect(body.questions).toHaveLength(3);
    expect(body.questions[0]).toMatchObject({
      id: 1,
      type: "short-answer",
      marks: 3
    });
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

    const response = await worker.fetch(request);
    const body = (await response.json()) as ValidationErrorResponse;

    expect(response.status).toBe(400);
    expect(body.error).toBe("Validation Error");
    expect(body.message).toBe("Request body does not match the expected generate format");
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects GET requests to generate", async () => {
    const request = new Request("http://example.com/generate", {
      method: "GET"
    });

    const response = await worker.fetch(request);
    const body = (await response.json()) as ErrorResponse;

    expect(response.status).toBe(405);
    expect(body).toEqual({
      error: "Method Not Allowed",
      message: "Use POST /generate"
    });
  });
});