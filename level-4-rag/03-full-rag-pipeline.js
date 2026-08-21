/**
 * LEVEL 4 — Exercise 3: The full RAG pipeline
 *
 * Concepts covered:
 *   - "augmentation": taking the retrieved chunks and inserting them into
 *     the prompt as context, BEFORE asking the model to answer
 *   - grounding the model so it answers from the provided context instead
 *     of its own (possibly wrong, possibly out-of-date) training data —
 *     and telling it to say so when the context doesn't contain the answer
 *   - citing sources, so a human can verify the answer against the
 *     original document instead of just trusting the model
 *
 * The full pipeline is: question -> retrieve top-k chunks -> build a
 * prompt with those chunks as context -> ask the model -> answer + citations.
 *
 * Run:  npm run l4:rag
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { client, MODEL, getText } from "../llm-client.js";
import { loadDocuments, chunkAllDocuments, buildIndex, search } from "./rag-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "docs");

async function answerFromDocs(index, question, topK = 3) {
  const results = search(index, question, topK);

  // This is the "augmentation" step: retrieved chunks become part of the
  // prompt, each labeled with its source so the model (and we) can cite it.
  const context = results
    .map((r, i) => `[Source ${i + 1}: ${r.chunk.source}]\n${r.chunk.text}`)
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "You answer questions using ONLY the context provided below. " +
          "Cite which Source number(s) you used, like '(Source 1)'. " +
          "If the context does not contain the answer, say plainly that you " +
          "don't have that information — do NOT use outside knowledge or guess.\n\n" +
          `--- CONTEXT ---\n${context || "(no relevant context was found)"}`,
      },
      { role: "user", content: question },
    ],
  });

  return {
    answer: getText(response),
    chunksUsed: results.map((r) => `${r.chunk.source} #${r.chunk.chunkIndex}`),
  };
}

async function main() {
  const docs = loadDocuments(DOCS_DIR);
  const index = buildIndex(chunkAllDocuments(docs));

  const questions = [
    "How much does the Pro plan cost per month, and how much storage do I get?",
    "I subscribed to Pro three days ago and want my money back. What do I do?",
    "Do you support 24/7 phone support?", // in-scope: answer is explicitly "no"
    "What programming language is Nimbus Files built with?", // NOT in the docs at all
  ];

  for (const question of questions) {
    console.log(`\nQ: ${question}`);
    const { answer, chunksUsed } = await answerFromDocs(index, question);
    console.log(`A: ${answer}`);
    console.log(`   (retrieved: ${chunksUsed.join(", ") || "nothing"})`);
  }

  console.log(
    "\n--- Why this matters ---\n" +
      "Without retrieval, the model would have to GUESS at company-specific\n" +
      "facts like refund windows or plan prices — and it would likely sound\n" +
      "just as confident while being wrong. Grounding it in real documents,\n" +
      "and explicitly permitting 'I don't know', is what makes a RAG-backed\n" +
      "support bot trustworthy enough to actually deploy."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
