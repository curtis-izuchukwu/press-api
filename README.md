# FlightDeck-API
A serverless Cloudflare Workers API that generates structured revision material from topic, difficulty, and question-count inputs. Built as the AI-powered content engine behind StudyPilot, with validation, caching, and integration-ready JSON output.

## Purpose
The service will eventually accept a topic, difficulty, and question count, then return structured revision material as JSON.

## Planned Features
- Health-check endpoint
- Worksheet/revision material generation endpoint
- Input validation
- Workers AI integration
- Structured JSON output
- Optional caching with Workers KV
- Optional persistence with Cloudflare D1
- Integration with PararePilot

## Tech Stack
- TypeScript
- Cloudflare Workers
- Wrangler
- REST API

## Local Development
```bash
npm install
npm run dev
