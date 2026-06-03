# FlightDeck API

FlightDeck API is a small serverless REST API built with Cloudflare Workers and TypeScript. It provides structured revision-material endpoints for study tools and will later support PararePilot, an adaptive study tracker.

## Current status

Milestone 1 complete: project foundation and health-check endpoint.

## Tech stack

- TypeScript
- Cloudflare Workers
- Wrangler
- REST API

## Endpoints

### GET /health

## Roadmap

Add /generate endpoint
Add request validation
Add structured worksheet response format
Integrate Workers AI
Add caching with Cloudflare KV
Add persistence with Cloudflare D1
Add tests

Returns service status metadata.

Example response:

```json
{
  "status": "ok",
  "service": "FlightDeck API",
  "version": "0.1.0"
}

