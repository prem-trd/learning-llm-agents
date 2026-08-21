/**
 * LEVEL 6 — Exercise 1: Rule-based evaluation
 *
 * Concepts covered:
 *   - "it worked when I tried it" is not evidence — you need a fixed set of
 *     test cases you can re-run every time you change a prompt, a model, or
 *     a tool, so you can tell whether things got better or worse.
 *   - the cheapest, most reliable kind of eval is a RULE: a plain JS
 *     function that checks the response and returns true/false. No extra
 *     API calls, fully deterministic, instant. Use this whenever
 *     correctness can be captured mechanically.
 *   - structured output (Level 1, Ex.3) makes rule-based eval MUCH easier —
 *     asserting `parsed.sentiment === "positive"` is far more reliable than
 *     regexing free-form prose for the word "positive".
 *
 * Run:  npm run l6:rules
 */
import "dotenv/config";
import { client, MODEL, getText, parseJSON } from "../llm-client.js";

const testCases = [
  {
    name: "arithmetic",
    userMessage: "What is 17 * 23? Reply with just the number.",
    check: (text) => text.includes("391"),
  },
  {
    name: "fact-lookup",
    userMessage: "What is the chemical symbol for gold?",
    check: (text) => /\bAu\b/.test(text),
  },
  {
    name: "exact-format-compliance",
    userMessage: "Respond with exactly one word, lowercase, nothing else: 'confirmed'.",
    check: (text) => text.trim().toLowerCase() === "confirmed",
  },
];

// A test case using structured output instead of free text — the check
// becomes a simple field comparison, not a guess about model phrasing.
async function structuredOutputCase() {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: 'Respond with ONLY raw JSON, no markdown fences: {"sentiment": "positive" | "negative" | "neutral"}',
      },
      { role: "user", content: "Classify the sentiment: 'I love this product, it's fantastic!'" },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "sentiment",
        strict: true,
        schema: {
          type: "object",
          properties: { sentiment: { type: "string", enum: ["positive", "negative", "neutral"] } },
          required: ["sentiment"],
          additionalProperties: false,
        },
      },
    },
  });
  const text = getText(response);
  const parsed = parseJSON(text);
  return { text, pass: parsed.sentiment === "positive" };
}

async function runTextCase(testCase) {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{ role: "user", content: testCase.userMessage }],
  });
  const text = getText(response);
  return { text, pass: testCase.check(text) };
}

async function main() {
  console.log("--- Running the eval suite ---\n");
  const results = [];

  for (const testCase of testCases) {
    const { text, pass } = await runTextCase(testCase);
    results.push({ name: testCase.name, pass, text });
    console.log(`${pass ? "✅" : "❌"} ${testCase.name}`);
    console.log(`   response: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);
  }

  const { text, pass } = await structuredOutputCase();
  results.push({ name: "sentiment-classification (structured)", pass, text });
  console.log(`${pass ? "✅" : "❌"} sentiment-classification (structured)`);
  console.log(`   response: ${text}`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n--- Result: ${passed}/${results.length} passed ---`);

  console.log(
    "\n--- Where rule-based eval breaks down ---\n" +
      "Try writing a rule for: 'is this customer apology sincere?' or 'is\n" +
      "this explanation appropriate for a beginner?'. There's no substring or\n" +
      "regex that captures that — you'd need judgment. That's what Exercise\n" +
      "2 (LLM-as-judge) is for."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
