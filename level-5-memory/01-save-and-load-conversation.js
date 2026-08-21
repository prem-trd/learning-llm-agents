/**
 * LEVEL 5 — Exercise 1: Persisting conversation history across runs
 *
 * Concepts covered:
 *   - the chat completions API is STATELESS. It has zero memory of any
 *     previous request. Every time you call it, YOU send the entire
 *     conversation history again (`messages: [...]`) — that's what
 *     "memory" is built on.
 *   - so far, that history has lived in a JS array that dies the moment the
 *     script exits. This exercise persists it to a file on disk, so the
 *     NEXT time you run the script (a brand new process, no shared memory),
 *     it picks the conversation back up.
 *
 * This is the simplest possible kind of memory: full transcript replay.
 * It works, but doesn't scale — see the note at the bottom.
 *
 * Try it as a real two-step demo:
 *   npm run l5:persist -- "My name is Alex and my favorite language is Rust."
 *   npm run l5:persist -- "What's my name, and what language do I like?"
 *
 * (the "--" tells npm to pass the rest of the line to the script itself)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { client, MODEL } from "../llm-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const HISTORY_FILE = path.join(DATA_DIR, "conversation.json");

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
}

function saveHistory(messages) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(messages, null, 2));
}

async function main() {
  const userMessage =
    process.argv.slice(2).join(" ") || "Hi, this is a fresh conversation with no prior message.";

  const history = loadHistory();
  console.log(`Loaded ${history.length} prior message(s) from disk.\n`);

  const systemPrompt = { role: "system", content: "You are a helpful assistant with a good memory for details the user has told you." };
  // Only prepend the system message once — if we already have history, it's in there.
  const messages = history.length > 0 ? [...history] : [systemPrompt];
  messages.push({ role: "user", content: userMessage });

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages,
  });

  const replyText = response.choices[0].message.content ?? "";
  console.log(`User: ${userMessage}`);
  console.log(`Assistant: ${replyText}\n`);

  // Persist BOTH the new user turn and the assistant's reply, so next time
  // this script runs, the full exchange is part of the loaded history.
  messages.push(response.choices[0].message);
  saveHistory(messages);
  console.log(`Saved ${messages.length} total messages to ${HISTORY_FILE}`);

  console.log(
    "\n--- Why this doesn't scale ---\n" +
      "Every run re-sends the ENTIRE history — token cost and latency grow\n" +
      "with every turn, forever, and eventually you hit the context window\n" +
      "limit from Level 1 (which, on Ollama, is often smaller by default than\n" +
      "you'd expect — see the note in Level 1 Ex.2). Full-transcript replay is\n" +
      "fine for a short-lived chat session, but it is NOT how you'd remember a\n" +
      "user's preferences across months of usage. Exercise 2 fixes this by\n" +
      "storing durable FACTS instead of the whole conversation."
  );

  console.log(`\n(delete ${path.relative(process.cwd(), HISTORY_FILE)} to reset and start over)`);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
