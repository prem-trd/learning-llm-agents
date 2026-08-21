/**
 * LEVEL 1 — Exercise 2: Tokens & context window
 *
 * Concepts covered:
 *   - what "tokens" actually are (not words, not characters)
 *   - Ollama's OpenAI-compatible API has NO pre-flight token-counting
 *     endpoint (some providers, like Anthropic, do — Ollama doesn't).
 *     So: estimate BEFORE a call (rough heuristic), and read the REAL
 *     count AFTER a call, from response.usage.
 *   - the context window: total tokens a model can "see" at once
 *     (system prompt + message history + the response all share this budget)
 *
 * Run:  npm run l1:tokens
 */
import "dotenv/config";
import { client, MODEL, estimateTokens } from "../llm-client.js";

async function main() {
  const samples = [
    "Hi",
    "Hello, how are you doing today?",
    "supercalifragilisticexpialidocious",
    "The quick brown fox jumps over the lazy dog.",
  ];

  console.log("--- A quick, ROUGH estimate before calling the model ---\n");
  console.log(
    "(chars/4 is a common rule-of-thumb approximation for English text — it's\n" +
      "not exact, and gets less accurate for code, non-English text, or very\n" +
      "short strings. It exists because Ollama has no real counting endpoint.)\n"
  );
  for (const text of samples) {
    console.log(`"${text}"  ->  ~${estimateTokens(text)} tokens (estimate)`);
  }

  console.log("\n--- The REAL count, only available AFTER you actually call the model ---\n");
  for (const text of samples.slice(0, 2)) {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1, // we only care about prompt_tokens here, not the reply
      messages: [{ role: "user", content: text }],
    });
    console.log(`"${text}"  ->  ${response.usage.prompt_tokens} tokens (actual, from response.usage)`);
  }

  console.log("\n--- Why this matters ---");
  console.log(
    "1. You're billed/metered per token (input + output), not per character.\n" +
      "2. Every model has a maximum CONTEXT WINDOW — the total tokens it can\n" +
      "   process in one request (system prompt + all messages + the reply).\n" +
      "   Ollama's context window is MODEL- AND DEPLOYMENT-SPECIFIC, and\n" +
      "   local Ollama often defaults to a much smaller window (commonly\n" +
      "   2048 or 4096 tokens) than a model is technically capable of, unless\n" +
      "   you explicitly configure it larger. Ollama Cloud models generally\n" +
      "   run at their full native context window. Check a specific model's\n" +
      "   limits with `ollama show <model>` once you're running locally.\n" +
      "   If your conversation history grows past the window, you must trim,\n" +
      "   summarize, or use techniques from Level 5 (Memory) to manage it."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
