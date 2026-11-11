require('dotenv').config();

const { QdrantClient } = require('@qdrant/js-client-rest');
const express = require('express');
const morgan = require('morgan');
const { randomUUID } = require('node:crypto');
const { embed, generateAnswer } = require('./gemini');

const {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_EMBEDDING_MODEL,
  GEMINI_EMBEDDING_DIMENSIONS,
  PORT = 3000,
  QDRANT_API_KEY,
  QDRANT_COLLECTION = 'demo_documents',
  QDRANT_URL = 'http://localhost:6333'
} = process.env;

const requiredGeminiConfig = {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  GEMINI_EMBEDDING_MODEL,
  GEMINI_EMBEDDING_DIMENSIONS
};
const missingGeminiConfig = Object.entries(requiredGeminiConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingGeminiConfig.length) {
  throw new Error(`Missing required .env values: ${missingGeminiConfig.join(', ')}`);
}

const vectorSize = Number(GEMINI_EMBEDDING_DIMENSIONS);
if (!Number.isInteger(vectorSize) || vectorSize < 1) {
  throw new Error('GEMINI_EMBEDDING_DIMENSIONS must be a positive integer.');
}

const app = express();
const qdrant = new QdrantClient({
  url: QDRANT_URL,
  ...(QDRANT_API_KEY ? { apiKey: QDRANT_API_KEY } : {})
});
let collectionReady = false;

app.use(express.json());
app.use(morgan('dev'));

async function ensureCollection() {
  if (collectionReady) return;

  const { collections } = await qdrant.getCollections();
  if (!collections.some(({ name }) => name === QDRANT_COLLECTION)) {
    await qdrant.createCollection(QDRANT_COLLECTION, {
      vectors: { size: vectorSize, distance: 'Cosine' }
    });
  }
  collectionReady = true;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/documents', async (req, res, next) => {
  try {
    const { text, metadata = {} } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text must be a non-empty string' });
    }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return res.status(400).json({ error: 'metadata must be an object' });
    }

    await ensureCollection();
    const id = randomUUID();
    const vector = await embed(text);

    await qdrant.upsert(QDRANT_COLLECTION, {
      wait: true,
      points: [{ id, vector, payload: { text, metadata } }]
    });

    res.status(201).json({ id, message: 'Document added' });
  } catch (error) {
    next(error);
  }
});

app.post('/search', async (req, res, next) => {
  try {
    const { query, limit = 5 } = req.body;
    if (typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'query must be a non-empty string' });
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return res.status(400).json({ error: 'limit must be an integer from 1 to 50' });
    }

    await ensureCollection();
    const vector = await embed(query);
    const response = await qdrant.query(QDRANT_COLLECTION, {
      query: vector,
      limit,
      with_payload: true
    });
    const results = response.points;
    const answer = await generateAnswer(query, results);

    res.json({
      answer,
      results: results.map(({ id, score, payload }) => ({
        id,
        score,
        text: payload?.text,
        metadata: payload?.metadata || {}
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || 500;
  const message = error.message || 'Internal server error';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Vector search demo listening on http://localhost:${PORT}`);
});
