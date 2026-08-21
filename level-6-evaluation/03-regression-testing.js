/**
 * LEVEL 6 — Exercise 3: Regression testing a prompt change
 *
 * Concepts covered:
 *   - the real reason you build an eval suite: so when you change a
 *     system prompt (or a model, or a tool), you can PROVE it got better
 *     and didn't quietly break something else — instead of eyeballing one
 *     or two examples and hoping.
 *   - this is the exact same eval set run TWICE, once per prompt version,
 *     compared side by side. This is what you'd wire into CI before
 *     merging a prompt change in a real system.
 *
 * The scenario: a financial-info assistant is required to always include
 * a disclaimer. `systemPromptV1` forgets to require it; `systemPromptV2`
 * fixes that. The eval suite should catch the difference automatically.
 *
 * Run:  npm run l6:regression
 */
import "dotenv/config";
import { client, MODEL, getText } from "../llm-client.js";

const DISCLAIMER = "This is not financial advice.";

const systemPromptV1 = "You are a helpful financial information assistant.";

const systemPromptV2 =
  "You are a helpful financial information assistant. " +
  `You must end every response with the exact sentence: "${DISCLAIMER}"`;

const testCases = [
  { name: "stock-question", userMessage: "Should I buy Apple stock right now?" },
  { name: "savings-question", userMessage: "What's a good interest rate for a savings account?" },
  { name: "retirement-question", userMessage: "How much should I save for retirement by age 40?" },
  { name: "off-topic-control", userMessage: "What's the boiling point of water?" }, // sanity check: disclaimer should apply to ALL responses per the instruction, even unrelated ones
];

function checkForDisclaimer(text) {
  return text.includes(DISCLAIMER);
}

async function runSuite(systemPrompt, label) {
  console.log(`\n--- Running suite against: ${label} ---`);
  const results = [];
  for (const testCase of testCases) {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: testCase.userMessage },
      ],
    });
    const text = getText(response);
    const pass = checkForDisclaimer(text);
    results.push({ name: testCase.name, pass });
    console.log(`  ${pass ? "✅" : "❌"} ${testCase.name}`);
  }
  return results;
}

async function main() {
  const resultsV1 = await runSuite(systemPromptV1, "systemPromptV1 (no disclaimer requirement)");
  const resultsV2 = await runSuite(systemPromptV2, "systemPromptV2 (disclaimer required)");

  console.log("\n--- Side-by-side comparison ---");
  console.log(`  ${"test".padEnd(24)} v1      v2`);
  for (let i = 0; i < testCases.length; i++) {
    const v1 = resultsV1[i].pass ? "pass" : "FAIL";
    const v2 = resultsV2[i].pass ? "pass" : "FAIL";
    const changed = resultsV1[i].pass !== resultsV2[i].pass ? "  <- changed" : "";
    console.log(`  ${testCases[i].name.padEnd(24)} ${v1.padEnd(8)}${v2}${changed}`);
  }

  const passRateV1 = resultsV1.filter((r) => r.pass).length / resultsV1.length;
  const passRateV2 = resultsV2.filter((r) => r.pass).length / resultsV2.length;
  console.log(`\n  Pass rate v1: ${(passRateV1 * 100).toFixed(0)}%`);
  console.log(`  Pass rate v2: ${(passRateV2 * 100).toFixed(0)}%`);

  console.log(
    "\n--- Why this matters ---\n" +
      "In a real deployment, this comparison is your merge gate: if pass rate\n" +
      "drops on ANY test case going from the currently-deployed prompt to a\n" +
      "candidate change, that's a regression, and you'd block the merge until\n" +
      "it's fixed — the same discipline as unit tests for regular code, applied\n" +
      "to prompts."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
