/**
 * LEVEL 6 — Exercise 2: LLM-as-judge for open-ended quality
 *
 * Concepts covered:
 *   - grading answers where correctness is a matter of JUDGMENT, not a
 *     fact you can pattern-match — tone, appropriateness, completeness.
 *   - each test case now has a RUBRIC instead of a rule function. The
 *     rubric must be specific and checkable, or the judge's grading will
 *     be just as fuzzy as not grading at all.
 *   - aggregating: pass rate AND average score across the whole suite,
 *     the same way you would for rule-based eval.
 *
 * Run:  npm run l6:judge
 */
import "dotenv/config";
import { client, MODEL, getText } from "../llm-client.js";
import { judgeResponse } from "./judge.js";

const testCases = [
  {
    name: "beginner-friendly-explanation",
    userMessage: "Explain what a firewall is to someone who has never used a computer.",
    rubric:
      "The explanation must avoid technical jargon (no 'packets', 'ports', 'protocols') " +
      "and use a real-world analogy a non-technical person would understand.",
  },
  {
    name: "customer-apology",
    userMessage:
      "A customer emailed: 'Your product broke after one day and I'm furious.' Write a reply.",
    rubric:
      "The reply must acknowledge the customer's frustration, apologize, and offer a " +
      "concrete next step (refund, replacement, or how to contact support) — not just " +
      "a generic 'sorry for the inconvenience' with no action.",
  },
  {
    name: "historical-summary",
    userMessage: "Summarize the causes of World War 1 in exactly 3 sentences.",
    rubric:
      "Must be exactly 3 sentences and mention at least two distinct, historically " +
      "accurate causes (e.g. the assassination of Archduke Franz Ferdinand, alliance " +
      "systems, militarism, nationalism, imperialism).",
  },
];

async function main() {
  console.log("--- Running the eval suite with an LLM judge ---\n");
  const results = [];

  for (const testCase of testCases) {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: testCase.userMessage }],
    });
    const answer = getText(response);

    const grade = await judgeResponse({
      question: testCase.userMessage,
      response: answer,
      rubric: testCase.rubric,
    });

    results.push({ name: testCase.name, ...grade });
    console.log(`${grade.pass ? "✅" : "❌"} ${testCase.name}  (score: ${grade.score}/5)`);
    console.log(`   answer: "${answer.slice(0, 100)}${answer.length > 100 ? "..." : ""}"`);
    console.log(`   judge:  ${grade.reasoning}\n`);
  }

  const passed = results.filter((r) => r.pass).length;
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  console.log(`--- Result: ${passed}/${results.length} passed, average score ${avgScore.toFixed(1)}/5 ---`);

  console.log(
    "\n--- A caveat worth knowing ---\n" +
      "LLM judges aren't perfectly consistent — the same response graded twice\n" +
      "can occasionally get a different verdict, especially on borderline cases,\n" +
      "and this can be MORE pronounced on smaller local models than on a large\n" +
      "cloud model. For high-stakes evals, run each case through the judge\n" +
      "multiple times and take a majority vote, or spot-check the judge's\n" +
      "reasoning against your own judgment on a sample before trusting it at scale."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
