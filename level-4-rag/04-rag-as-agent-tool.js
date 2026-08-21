/**
 * LEVEL 4 — Exercise 4: RAG as a tool the agent decides to use
 *
 * Exercise 3 always retrieved once, upfront, with the user's raw question
 * as the search query. That's simple, but it breaks down for multi-part
 * questions — a single query vector is a blend of everything the question
 * is about, which can dilute retrieval for each individual part.
 *
 * "Agentic RAG" fixes this by giving the model a `search_knowledge_base`
 * TOOL (reusing the exact Level 3 agent loop) instead of retrieving for it.
 * Now the model can:
 *   - break a multi-part question into several focused searches
 *   - search again with a different query if the first search came back thin
 *   - decide NOT to search at all for a question that doesn't need the docs
 *
 * This is the same "LLM -> Tool -> Observe -> LLM" loop from Level 3 —
 * retrieval is just another tool now.
 *
 * Run:  npm run l4:agentic-rag
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { client, MODEL } from "../llm-client.js";
import { loadDocuments, chunkAllDocuments, buildIndex, search } from "./rag-utils.js";
import { runAgent } from "../level-3-agent-loop/agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.join(__dirname, "docs");

function searchKnowledgeBase(index, input) {
  const results = search(index, input.query, input.topK ?? 3);
  if (results.length === 0) {
    return { results: [], note: "No relevant documents found for this query." };
  }
  return {
    results: results.map((r) => ({
      source: r.chunk.source,
      chunkIndex: r.chunk.chunkIndex,
      text: r.chunk.text,
      relevanceScore: Number(r.score.toFixed(3)),
    })),
  };
}

const tools = [
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description:
        "Search the Nimbus Files support knowledge base (pricing, refunds, " +
        "security, and support-hours documents). Call this once per distinct " +
        "sub-question — a focused query returns better matches than a query " +
        "trying to cover several topics at once. Returns [] if nothing matches, " +
        "which means the knowledge base has no information on that topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "A short, focused search query" },
          topK: { type: "integer", description: "How many results to return (default 3)" },
        },
        required: ["query"],
      },
    },
  },
];

async function main() {
  const docs = loadDocuments(DOCS_DIR);
  const index = buildIndex(chunkAllDocuments(docs));

  const toolImplementations = {
    search_knowledge_base: (input) => searchKnowledgeBase(index, input),
  };

  const questions = [
    // Multi-part: a naive single retrieval over the whole question would
    // blend "refund" and "support hours" into one weaker query. Watch the
    // trace below — a good agent searches for each part separately.
    "What's your refund policy, and separately, what are your support hours for Business customers?",
    // Out of scope entirely — the agent should search, come up empty, and say so.
    "Can I use Nimbus Files to store medical records?",
  ];

  for (const question of questions) {
    console.log(`\n=== Q: ${question} ===`);
    const result = await runAgent({
      client,
      model: MODEL,
      system:
        "You are a support assistant for Nimbus Files. Answer using ONLY " +
        "information returned by search_knowledge_base — never rely on outside " +
        "knowledge. Break multi-part questions into separate focused searches. " +
        "If a search returns nothing relevant, say plainly you don't have that information.",
      tools,
      toolImplementations,
      userMessage: question,
      maxIterations: 5,
    });
    console.log(`\nA: ${result.text}`);
    console.log(`(${result.iterations} search round(s))`);
  }

  console.log(
    "\n--- Compare to Exercise 3 ---\n" +
      "Exercise 3 ran exactly one retrieval per question, using the raw\n" +
      "question as the query. Here the model can search multiple times with\n" +
      "queries IT writes — for the two-part question above, look at the\n" +
      "trace to see whether it issued two separate, more focused searches."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
