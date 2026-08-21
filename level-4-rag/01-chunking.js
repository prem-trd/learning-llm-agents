/**
 * LEVEL 4 — Exercise 1: Chunking documents
 *
 * Concepts covered:
 *   - RAG = Retrieval-Augmented Generation: instead of relying on what the
 *     model was trained on, you fetch relevant text from YOUR data and hand
 *     it to the model as context before it answers.
 *   - Step one of any RAG pipeline is CHUNKING: splitting documents into
 *     small pieces. You retrieve and inject CHUNKS, not whole documents —
 *     an entire document is usually too big, and mostly irrelevant to any
 *     single question anyway.
 *   - The size trade-off: chunks too large waste context window budget and
 *     dilute relevance (a 2,000-word chunk might have one relevant sentence
 *     buried in it); chunks too small lose surrounding context a fact needs
 *     to make sense.
 *
 * Run:  npm run l4:chunking
 */
import path from "path";
import { fileURLToPath } from "url";
import { loadDocuments, chunkAllDocuments } from "./rag-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "docs");

function main() {
  const docs = loadDocuments(DOCS_DIR);
  console.log(`Loaded ${docs.length} documents from ${DOCS_DIR}:\n`);
  for (const doc of docs) console.log(`  - ${doc.source} (${doc.text.length} chars)`);

  console.log("\n--- Chunked with maxChunkChars: 600 (roughly one paragraph each) ---\n");
  const chunks = chunkAllDocuments(docs, { maxChunkChars: 600 });
  for (const chunk of chunks) {
    console.log(`[${chunk.source} #${chunk.chunkIndex}] (${chunk.text.length} chars)`);
    console.log(`  "${chunk.text.slice(0, 90)}${chunk.text.length > 90 ? "..." : ""}"\n`);
  }
  console.log(`Total: ${chunks.length} chunks from ${docs.length} documents.`);

  console.log(
    "\n--- Try this ---\n" +
      "Change maxChunkChars to 150 and re-run. Notice some paragraphs now get\n" +
      "split into multiple chunks mid-thought — that's the 'too small' failure\n" +
      "mode. Then try 5000 — now most files are ONE giant chunk, which defeats\n" +
      "the purpose of retrieval (you'd always get the whole document back).\n" +
      "There's no universally correct chunk size; it depends on your documents\n" +
      "and the kinds of questions you expect."
  );
}

main();
