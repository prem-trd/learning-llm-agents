/**
 * LEVEL 4 — Exercise 2: Retrieval — finding the right chunks for a question
 *
 * Concepts covered:
 *   - building an "index": turning every chunk into a vector once, up front
 *   - turning a QUERY into a vector the same way, then measuring similarity
 *     between the query vector and every chunk vector (cosine similarity)
 *   - "top-k retrieval": returning only the highest-scoring N chunks, not
 *     every chunk that matched at all
 *
 * This file does NOT call the Claude API — retrieval is a pure search
 * problem over your own data. The API only gets involved in Exercise 3,
 * once you're handing the model chunks to answer FROM.
 *
 * Run:  npm run l4:retrieval
 */
import path from "path";
import { fileURLToPath } from "url";
import {
  loadDocuments,
  chunkAllDocuments,
  buildIndex,
  search,
} from "./rag-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "docs");

function printResults(query, results) {
  console.log(`\nQuery: "${query}"`);
  if (results.length === 0) {
    console.log(
      "  (no chunks scored above zero — nothing in the corpus matches this)",
    );
    return;
  }
  for (const { chunk, score } of results) {
    console.log(
      `  score=${score.toFixed(3)}  [${chunk.source} #${chunk.chunkIndex}]`,
    );
    console.log(
      `    "${chunk.text.slice(0, 100)}${chunk.text.length > 100 ? "..." : ""}"`,
    );
  }
}

function main() {
  const docs = loadDocuments(DOCS_DIR);
  const chunks = chunkAllDocuments(docs);
  const index = buildIndex(chunks); // do this ONCE — reuse `index` for every query

  console.log(`Indexed ${chunks.length} chunks from ${docs.length} documents.`);

  const queries = [
    "how much storage does the pro plan include",
    "can I get my money back",
    "is my data encrypted",
    "what are your support hours on weekends",
    "do you accept cryptocurrency payments", // deliberately NOT in the docs
  ];

  for (const query of queries) {
    const results = search(index, query, 3);
    printResults(query, results);
  }

  console.log(
    "\n--- Notice ---\n" +
      "The crypto-payments query returned nothing — there's no shared\n" +
      "vocabulary between that question and anything in the docs, so every\n" +
      "score came out at or near zero and got filtered out. That's the right\n" +
      "behavior for a RAG system: if there's nothing relevant to retrieve,\n" +
      "don't hand the model made-up context and hope it doesn't use it.\n" +
      "Exercise 3 builds on exactly this to prevent the model from\n" +
      "hallucinating an answer when the knowledge base has nothing to say.",
  );
}

main();
