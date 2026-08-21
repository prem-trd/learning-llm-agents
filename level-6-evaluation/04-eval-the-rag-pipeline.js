/**
 * LEVEL 6 — Exercise 4: Evaluating a RAG pipeline (Level 4, revisited)
 *
 * A RAG system can fail in two INDEPENDENT places, and you have to measure
 * them separately or you won't know what to fix:
 *
 *   1. RETRIEVAL quality — did the search step find the right document at
 *      all? If not, the model never had a chance, no matter how good it is.
 *   2. GENERATION quality — given the right context, did the model actually
 *      use it correctly (and stay grounded — no hallucinating past the
 *      context, no guessing when context is missing)?
 *
 * This reuses the exact knowledge base and retrieval index from Level 4,
 * and evaluates both layers: a rule-based check for retrieval ("was the
 * expected source in the top-k results?") and an LLM-as-judge check for
 * generation ("is the final answer grounded and, when appropriate,
 * correctly says it doesn't know?").
 *
 * Run:  npm run l6:rag-eval
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { client, MODEL, getText } from "../llm-client.js";
import { loadDocuments, chunkAllDocuments, buildIndex, search } from "../level-4-rag/rag-utils.js";
import { judgeResponse } from "./judge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "..", "level-4-rag", "docs");

// Each case says which source document SHOULD show up in retrieval.
// `expectedSource: null` means this question is out of scope on purpose —
// the correct retrieval behavior is to find nothing relevant.
const evalSet = [
  {
    question: "How much storage do I get on the Pro plan?",
    expectedSource: "pricing.txt",
    generationRubric: "The answer must correctly state the Pro plan's storage amount, grounded in the provided context.",
  },
  {
    question: "How many days do I have to request a refund after subscribing?",
    expectedSource: "refund-policy.txt",
    generationRubric: "The answer must state the refund window from the context (14 days) without inventing a different number.",
  },
  {
    question: "Is data encrypted while it's being uploaded?",
    expectedSource: "security.txt",
    generationRubric: "The answer must mention encryption in transit (TLS), grounded in the provided context.",
  },
  {
    question: "Do you offer a student discount?",
    expectedSource: null, // not covered anywhere in the docs
    generationRubric: "The answer must clearly state this information isn't available, and must NOT invent a discount policy that isn't in the context.",
  },
];

async function answerFromDocs(index, question, topK = 3) {
  const results = search(index, question, topK);
  const context = results
    .map((r, i) => `[Source ${i + 1}: ${r.chunk.source}]\n${r.chunk.text}`)
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content:
          "Answer using ONLY the context below. If the context doesn't contain the " +
          "answer, say so plainly instead of guessing.\n\n" +
          `--- CONTEXT ---\n${context || "(no relevant context was found)"}`,
      },
      { role: "user", content: question },
    ],
  });

  return {
    answer: getText(response),
    retrievedSources: results.map((r) => r.chunk.source),
  };
}

async function main() {
  const docs = loadDocuments(DOCS_DIR);
  const index = buildIndex(chunkAllDocuments(docs));

  console.log("--- Evaluating retrieval + generation separately ---\n");

  const results = [];
  for (const testCase of evalSet) {
    const { answer, retrievedSources } = await answerFromDocs(index, testCase.question);

    // Layer 1: retrieval — a plain rule, no LLM call needed.
    const retrievalPass =
      testCase.expectedSource === null
        ? retrievedSources.length === 0
        : retrievedSources.includes(testCase.expectedSource);

    // Layer 2: generation — needs judgment, so we use the judge from Ex.2.
    const grade = await judgeResponse({
      question: testCase.question,
      response: answer,
      rubric: testCase.generationRubric,
    });

    results.push({ question: testCase.question, retrievalPass, generationPass: grade.pass, answer });

    console.log(`Q: ${testCase.question}`);
    console.log(`   retrieved: [${retrievedSources.join(", ") || "nothing"}]  expected: ${testCase.expectedSource ?? "nothing"}`);
    console.log(`   retrieval:  ${retrievalPass ? "✅ pass" : "❌ FAIL"}`);
    console.log(`   generation: ${grade.pass ? "✅ pass" : "❌ FAIL"}  (${grade.reasoning})`);
    console.log(`   answer: "${answer.slice(0, 90)}${answer.length > 90 ? "..." : ""}"\n`);
  }

  const retrievalPassRate = results.filter((r) => r.retrievalPass).length / results.length;
  const generationPassRate = results.filter((r) => r.generationPass).length / results.length;
  console.log("--- Summary ---");
  console.log(`  Retrieval pass rate:  ${(retrievalPassRate * 100).toFixed(0)}%`);
  console.log(`  Generation pass rate: ${(generationPassRate * 100).toFixed(0)}%`);

  console.log(
    "\n--- Why measuring these separately matters ---\n" +
      "If retrieval fails but generation 'passes' (correctly saying 'I don't\n" +
      "know'), your fix is a chunking/indexing problem — go back to Level 4.\n" +
      "If retrieval succeeds but generation fails (wrong answer despite having\n" +
      "the right context in front of it), the fix is a PROMPT problem — the\n" +
      "grounding instructions aren't strong enough, or the model just isn't\n" +
      "capable enough to follow them (a real risk with smaller local models —\n" +
      "worth re-testing this exact eval once you switch to local Ollama). A\n" +
      "single end-to-end pass/fail number can't tell you which of those\n" +
      "different problems you actually have."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
