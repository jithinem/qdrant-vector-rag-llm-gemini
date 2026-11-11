require('dotenv').config();

const axios = require('axios');
const { randomUUID } = require('node:crypto');
const { embed } = require('./gemini');

const {
  GEMINI_EMBEDDING_DIMENSIONS,
  QDRANT_API_KEY,
  QDRANT_COLLECTION = 'demo_documents',
  QDRANT_URL = 'http://localhost:6333'
} = process.env;

const vectorSize = Number(GEMINI_EMBEDDING_DIMENSIONS);
const qdrantUrl = QDRANT_URL.replace(/\/$/, '');
const collectionPath = `/collections/${encodeURIComponent(QDRANT_COLLECTION)}`;
const qdrantHeaders = {
  'Content-Type': 'application/json',
  ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {})
};

const documents = [
  {
    text: 'Qdrant is an open-source vector database designed for storing, searching, and managing vector embeddings.',
    metadata: { topic: 'qdrant', source: 'seed' }
  },
  {
    text: 'Vector embeddings represent text as arrays of numbers so that semantic similarity can be measured mathematically.',
    metadata: { topic: 'embeddings', source: 'seed' }
  },
  {
    text: 'Cosine similarity compares the direction of two vectors. It is commonly used to find semantically similar text.',
    metadata: { topic: 'similarity-search', source: 'seed' }
  },
  {
    text: 'Retrieval-augmented generation finds relevant documents with vector search and provides them as context to a language model.',
    metadata: { topic: 'rag', source: 'seed' }
  }
];

async function ensureCollection() {
  try {
    await axios.get(`${qdrantUrl}${collectionPath}`, { headers: qdrantHeaders });
  } catch (error) {
    if (error.response?.status !== 404) throw error;

    try {
      await axios.put(
        `${qdrantUrl}${collectionPath}`,
        { vectors: { size: vectorSize, distance: 'Cosine' } },
        { headers: qdrantHeaders }
      );
    } catch (createError) {
      if (createError.response?.status !== 409) throw createError;
    }
  }
}

async function seed() {
  if (!Number.isInteger(vectorSize) || vectorSize < 1) {
    throw new Error('GEMINI_EMBEDDING_DIMENSIONS must be a positive integer.');
  }

  const points = [];
  for (const document of documents) {
    points.push({
      id: randomUUID(),
      vector: await embed(document.text),
      payload: document
    });
    console.log(`Embedded: ${document.metadata.topic}`);
  }

  await ensureCollection();
  await axios.put(
    `${qdrantUrl}${collectionPath}/points?wait=true`,
    { points },
    { headers: qdrantHeaders }
  );
  console.log(`Saved ${points.length} embedded documents to Qdrant.`);
}

seed().catch((error) => {
  console.error(error.response?.data?.status?.error || error.message);
  process.exitCode = 1;
});
