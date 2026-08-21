/**
 * LEVEL 5 — Exercise 3: Letting the AGENT manage its own memory
 *
 * Exercise 2 extracted memory with a separate, hardcoded step after the
 * conversation ended. In practice, you usually want the AGENT itself to
 * decide, mid-conversation, "this is worth remembering" — and to decide
 * when a question needs checking against memory at all.
 *
 * This gives the agent two tools:
 *   - remember(content)  -> appends a note to a persistent memory bank
 *   - recall(query)       -> SEARCHES the memory bank and returns the best
 *                            matches (reusing the exact retrieval index
 *                            from Level 4 — memory search and document
 *                            search are the same problem)
 *
 * This is the same idea as a client-side "memory tool" pattern — simplified
 * to two operations instead of a full file-editing command set, but the
 * underlying pattern (the model reads/writes a persistent store via tool
 * calls) is identical.
 *
 * Run:  npm run l5:memory-tool
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { client, MODEL } from "../llm-client.js";
import { buildIndex, search } from "../level-4-rag/rag-utils.js";
import { runAgent } from "../level-3-agent-loop/agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory-bank.json");

function loadMemories() {
  if (!fs.existsSync(MEMORY_FILE)) return [];
  return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
}

function saveMemories(memories) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
}

// rag-utils' buildIndex/search work on any {source, chunkIndex, text}
// shaped list — a memory bank fits that shape just as well as document
// chunks did in Level 4. Reindex whenever the memory list changes.
function memoriesToChunks(memories) {
  return memories.map((m, i) => ({ source: "memory", chunkIndex: i, text: m.content }));
}

const tools = [
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Save a short, self-contained fact worth recalling in future conversations " +
        "(a preference, a decision, an identity detail). Only call this for things " +
        "that should genuinely persist — not for one-off requests.",
      parameters: {
        type: "object",
        properties: { content: { type: "string", description: "one clear sentence" } },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall",
      description:
        "Search previously saved memories for anything relevant to a topic. Call " +
        "this when the user references something that might have been discussed " +
        "before, or before answering a question that depends on stored preferences.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
];

function makeToolImplementations() {
  return {
    remember: (input) => {
      const memories = loadMemories();
      memories.push({ content: input.content, savedAt: new Date().toISOString() });
      saveMemories(memories);
      return { saved: true, totalMemories: memories.length };
    },
    recall: (input) => {
      const memories = loadMemories();
      if (memories.length === 0) return { results: [], note: "Memory bank is empty." };
      const index = buildIndex(memoriesToChunks(memories));
      const results = search(index, input.query, 3);
      if (results.length === 0) return { results: [], note: "No relevant memories found." };
      return { results: results.map((r) => r.chunk.text) };
    },
  };
}

async function main() {
  console.log("--- Session A: tell the agent something worth remembering ---\n");
  const resultA = await runAgent({
    client,
    model: MODEL,
    system:
      "You are a helpful ops assistant. Use `remember` to save durable facts the " +
      "user tells you, and `recall` to check memory before answering anything that " +
      "might depend on a past preference.",
    tools,
    toolImplementations: makeToolImplementations(),
    userMessage:
      "From now on, always deploy to production on Fridays only with my explicit " +
      "sign-off — default to Tuesday deploys otherwise.",
    maxIterations: 3,
  });
  console.log("\nAssistant:", resultA.text);

  console.log("\n--- Session B: a brand-new runAgent() call, simulating a new day ---\n");
  const resultB = await runAgent({
    client,
    model: MODEL,
    system:
      "You are a helpful ops assistant. Use `remember` to save durable facts the " +
      "user tells you, and `recall` to check memory before answering anything that " +
      "might depend on a past preference.",
    tools,
    toolImplementations: makeToolImplementations(),
    userMessage: "I want to ship the new release today, which is a Wednesday. Go ahead?",
    maxIterations: 3,
  });
  console.log("\nAssistant:", resultB.text);

  console.log(
    "\n--- Notice ---\n" +
      "Session B is a completely separate runAgent() call — no shared JS\n" +
      `state with Session A. It only \"remembers\" the Friday-only deploy rule\n` +
      "because it chose to call `recall`, which searched the memory bank\n" +
      `persisted to disk at ${path.relative(process.cwd(), MEMORY_FILE)}.\n` +
      "Delete that file to reset the agent's memory to empty."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
