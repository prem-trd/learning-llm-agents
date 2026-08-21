/**
 * LEVEL 4 — shared helper: chunking + a from-scratch retrieval index
 *
 * A NOTE ON EMBEDDINGS: most production RAG systems retrieve chunks using
 * "embeddings" — a separate model turns text into a vector, and similar
 * meanings end up as nearby vectors. Anthropic doesn't ship its own
 * embeddings endpoint (their recommended partner is Voyage AI), which
 * means using real embeddings here would require a SECOND API key just to
 * learn the concept.
 *
 * So instead, this file implements retrieval using TF-IDF + cosine
 * similarity — a classic, dependency-free technique that predates
 * embeddings by decades. It's weaker than embeddings (it matches on
 * shared WORDS, not deeper meaning — "car" and "automobile" look
 * unrelated to it), but the PIPELINE is identical:
 *
 *   documents -> chunks -> vectors -> similarity search -> top-k results
 *
 * Swap this file's `buildIndex`/`search` for a real embedding provider
 * later and nothing else in Level 4 has to change.
 */
import fs from "fs";
import path from "path";

// --- 1. Loading and chunking ---

export function loadDocuments(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
  return files.map((filename) => ({
    source: filename,
    text: fs.readFileSync(path.join(dir, filename), "utf-8"),
  }));
}

/**
 * Splits each document into chunks by paragraph (blank-line separated).
 * Real systems often use a fixed token/character size with some overlap
 * between chunks, so a fact split across a chunk boundary isn't lost. We
 * use paragraphs here because it's easy to read and these docs were
 * written with one idea per paragraph — but the trade-off is real: a
 * paragraph that's too long can still blow past what you want in one chunk,
 * and a paragraph that's too short loses surrounding context.
 */
export function chunkDocument(doc, { maxChunkChars = 600 } = {}) {
  const paragraphs = doc.text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks = [];
  for (const [i, paragraph] of paragraphs.entries()) {
    if (paragraph.length <= maxChunkChars) {
      chunks.push({ source: doc.source, chunkIndex: i, text: paragraph });
    } else {
      // A paragraph that's too long on its own gets split further, so no
      // single chunk ever exceeds our size budget.
      for (let start = 0; start < paragraph.length; start += maxChunkChars) {
        chunks.push({
          source: doc.source,
          chunkIndex: `${i}.${start / maxChunkChars}`,
          text: paragraph.slice(start, start + maxChunkChars),
        });
      }
    }
  }
  return chunks;
}

export function chunkAllDocuments(docs, options) {
  return docs.flatMap((doc) => chunkDocument(doc, options));
}

// --- 2. Tokenizing ---

const STOPWORDS = new Set([
  "a", "an", "and", "the", "is", "are", "of", "to", "in", "on", "for", "with",
  "at", "by", "from", "or", "we", "you", "your", "our", "it", "this", "that",
  "be", "as", "do", "does", "not", "can", "will", "if", "any", "all",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length > 1 && !STOPWORDS.has(tok));
}

// --- 3. Building a TF-IDF index over the chunks ---

/**
 * Returns an index object: { chunks, vectors, idf }
 *   - vectors[i] is a sparse Map<term, weight> for chunks[i]
 *   - idf is a Map<term, inverseDocumentFrequency> shared across the corpus
 */
export function buildIndex(chunks) {
  const termDocCount = new Map(); // term -> number of chunks containing it
  const chunkTermFreqs = chunks.map((chunk) => {
    const tokens = tokenize(chunk.text);
    const tf = new Map();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    for (const term of tf.keys()) {
      termDocCount.set(term, (termDocCount.get(term) ?? 0) + 1);
    }
    return tf;
  });

  const N = chunks.length;
  const idf = new Map();
  for (const [term, df] of termDocCount) {
    idf.set(term, Math.log(N / df) + 1); // +1 so no term ever hits zero weight
  }

  const vectors = chunkTermFreqs.map((tf) => {
    const vec = new Map();
    for (const [term, freq] of tf) {
      vec.set(term, freq * idf.get(term));
    }
    return vec;
  });

  return { chunks, vectors, idf };
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  for (const [term, weight] of vecA) {
    if (vecB.has(term)) dot += weight * vecB.get(term);
  }
  const normA = Math.sqrt([...vecA.values()].reduce((sum, w) => sum + w * w, 0));
  const normB = Math.sqrt([...vecB.values()].reduce((sum, w) => sum + w * w, 0));
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

/**
 * Vectorizes the query using the corpus's existing idf weights, scores
 * every chunk by cosine similarity, and returns the top-k matches.
 */
export function search(index, query, topK = 3) {
  const tokens = tokenize(query);
  const tf = new Map();
  for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);

  const queryVec = new Map();
  for (const [term, freq] of tf) {
    // A word never seen in the corpus contributes nothing — it can't
    // possibly help match a chunk, since no chunk has a weight for it either.
    if (index.idf.has(term)) queryVec.set(term, freq * index.idf.get(term));
  }

  const scored = index.chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(queryVec, index.vectors[i]),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((r) => r.score > 0); // don't return "top matches" that scored zero
}
