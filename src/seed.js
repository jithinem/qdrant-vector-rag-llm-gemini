require('dotenv').config();

const { QdrantClient } = require('@qdrant/js-client-rest');
const { randomUUID } = require('node:crypto');
const { embed } = require('./gemini');

const {
  GEMINI_EMBEDDING_DIMENSIONS,
  QDRANT_API_KEY,
  QDRANT_COLLECTION = 'demo_documents',
  QDRANT_URL = 'http://localhost:6333'
} = process.env;

const vectorSize = Number(GEMINI_EMBEDDING_DIMENSIONS);
const qdrant = new QdrantClient({
  url: QDRANT_URL,
  ...(QDRANT_API_KEY ? { apiKey: QDRANT_API_KEY } : {})
});

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
  const { collections } = await qdrant.getCollections();
  if (!collections.some(({ name }) => name === QDRANT_COLLECTION)) {
    await qdrant.createCollection(QDRANT_COLLECTION, {
      vectors: { size: vectorSize, distance: 'Cosine' }
    });
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
  await qdrant.upsert(QDRANT_COLLECTION, { wait: true, points });
  console.log(`Saved ${points.length} embedded documents to Qdrant.`);
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
