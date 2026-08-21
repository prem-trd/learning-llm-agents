/**
 * LEVEL 5 — Exercise 2: Remembering FACTS instead of the whole transcript
 *
 * Concepts covered:
 *   - instead of replaying an entire conversation forever (Exercise 1),
 *     extract the small number of DURABLE facts worth keeping — using
 *     structured output, the same technique from Level 1 Exercise 3 — and
 *     store just those.
 *   - on a brand-new conversation, inject those facts into the SYSTEM
 *     MESSAGE instead of the message history. The model "remembers" the
 *     user without ever having seen the original conversation.
 *   - this is a compression step: a 20-turn conversation might reduce to
 *     3 one-line facts. That's the whole point of memory design — deciding
 *     what's worth keeping, not keeping everything.
 *
 * Run:  npm run l5:facts
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { client, MODEL, getText, parseJSON } from "../llm-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const FACTS_FILE = path.join(DATA_DIR, "facts.json");

function loadFacts() {
  if (!fs.existsSync(FACTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(FACTS_FILE, "utf-8"));
}

function saveFacts(facts) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FACTS_FILE, JSON.stringify(facts, null, 2));
}

// A short, finished conversation we're about to "close out" and extract
// memory from — imagine this actually happened over a real chat session.
const PAST_CONVERSATION = [
  { role: "user", content: "Hi! I'm setting up notifications for our app." },
  { role: "assistant", content: "Sure — what would you like to configure?" },
  {
    role: "user",
    content:
      "I only want to be paged for P1 incidents, never P2 or below. Also, my timezone " +
      "is IST, and please always refer to me as 'Priya' not my full name.",
  },
  { role: "assistant", content: "Got it — P1-only paging, IST, and I'll call you Priya." },
];

async function extractFacts(conversation) {
  const transcript = conversation.map((m) => `${m.role}: ${m.content}`).join("\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        // Reinforcing the exact shape in plain language, on top of the schema
        // below, measurably improves compliance on models with weaker
        // response_format enforcement (see Level 1 Ex.3 for why).
        role: "system",
        content:
          "Respond with ONLY raw JSON — no markdown fences, no commentary. " +
          'Use EXACTLY this shape: {"facts": [{"category": "...", "content": "..."}]}',
      },
      {
        role: "user",
        content:
          "Read this conversation and extract only the DURABLE facts worth " +
          "remembering for future conversations — preferences, decisions, " +
          "identity details. Skip pleasantries and one-off requests.\n\n" +
          transcript,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "extracted_facts",
        strict: true,
        schema: {
          type: "object",
          properties: {
            facts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string", description: "e.g. 'preference', 'identity', 'decision'" },
                  content: { type: "string", description: "one short, self-contained sentence" },
                },
                required: ["category", "content"],
                additionalProperties: false,
              },
            },
          },
          required: ["facts"],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = parseJSON(getText(response));
  return parsed.facts;
}

async function main() {
  console.log("--- Step 1: extract durable facts from a finished conversation ---\n");
  const newFacts = await extractFacts(PAST_CONVERSATION);
  for (const fact of newFacts) console.log(`  [${fact.category}] ${fact.content}`);

  const existingFacts = loadFacts();
  const allFacts = [...existingFacts, ...newFacts.map((f) => ({ ...f, savedAt: new Date().toISOString() }))];
  saveFacts(allFacts);
  console.log(`\nSaved. Memory bank now has ${allFacts.length} fact(s) total in ${FACTS_FILE}`);

  console.log("\n--- Step 2: start a BRAND NEW conversation, no transcript in sight ---\n");
  const factsBlock = allFacts.map((f) => `- (${f.category}) ${f.content}`).join("\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      { role: "system", content: `Known facts about this user from previous conversations:\n${factsBlock}` },
      { role: "user", content: "Ping me if anything breaks." },
    ],
  });

  console.log("User: Ping me if anything breaks.");
  console.log("Assistant:", getText(response));

  console.log(
    "\n--- Notice ---\n" +
      "The model never saw the original conversation about P1-only paging or\n" +
      "the name preference — it only saw the compressed facts in the system\n" +
      "message, yet it should apply them correctly (using 'Priya', respecting\n" +
      "the P1-only rule). Re-run this file a few times: facts accumulate in\n" +
      `${path.relative(process.cwd(), FACTS_FILE)} across runs, same as a real memory store would.`
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
