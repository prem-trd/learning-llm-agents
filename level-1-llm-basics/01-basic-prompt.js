/**
 * LEVEL 1 — Exercise 1: Basic prompts
 *
 * Concepts covered:
 *   - system prompt vs user prompt
 *   - max_tokens (hard output cap)
 *   - streaming a response
 *
 * Uses Ollama's OpenAI-compatible API (see ../llm-client.js). The concepts
 * here are identical to any provider — only the exact field names differ:
 *   - the system prompt is a MESSAGE with role "system", not a separate
 *     top-level field like some other APIs use
 *   - the reply text lives at response.choices[0].message.content
 *
 * Run:  npm run l1:basic
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";

async function main() {
  console.log(`(using model: ${MODEL})\n`);
  console.log("--- 1. A single, non-streamed request ---\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      // The system message sets persistent behavior/persona for the whole
      // conversation. It is NOT a message from the user — it's instructions
      // to the model, and it goes FIRST in the messages array.
      { role: "system", content: "You are a terse, no-nonsense explainer. Never use bullet points." },
      { role: "user", content: "In two sentences, what is a 'token' in the context of LLMs?" },
    ],
  });

  console.log(response.choices[0].message.content);

  console.log("\n--- usage ---");
  console.log(response.usage); // prompt_tokens / completion_tokens / total_tokens spent on this call

  console.log("\n\n--- 2. Same idea, but streamed token-by-token ---\n");

  // Streaming matters once outputs get long — the user sees text appear
  // progressively instead of waiting for the whole response.
  const stream = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    stream: true,
    stream_options: { include_usage: true }, // ask for a final usage chunk at the end
    messages: [
      { role: "system", content: "You are a terse, no-nonsense explainer. Never use bullet points." },
      { role: "user", content: "Now explain 'context window' the same way." },
    ],
  });

  let finalUsage;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
    if (chunk.usage) finalUsage = chunk.usage;
  }

  console.log("\n\n--- usage (streamed call) ---");
  console.log(finalUsage ?? "(this model/deployment didn't return usage on the stream)");
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
