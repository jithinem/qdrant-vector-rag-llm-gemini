# Qdrant Vector Search Demo

A minimal Express API that creates Gemini embeddings, stores/searches them in Qdrant using the official Qdrant JavaScript client, and generates a context-based answer.

## Setup

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The Gemini model names and embedding dimensions are also configured there.
2. Start a Qdrant instance at `QDRANT_URL` (defaults to `http://localhost:6333`).
3. Install dependencies and run:

```bash
npm install
npm run dev
```

The app creates the configured collection on its first document or search request. With the app running, seed it with sample documents:

```bash
npm run seed
```

Import `postman.json` into Postman to try the endpoints.

## Endpoints

- `GET /health`
- `POST /documents` — JSON: `{ "text": "...", "metadata": {} }`
- `POST /search` — JSON: `{ "query": "...", "limit": 5 }` (limit: 1–50); returns similar documents and a Gemini-generated answer.
