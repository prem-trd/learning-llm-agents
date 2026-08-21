/**
 * LEVEL 6 — shared helper: an "LLM-as-judge" grader
 *
 * Some correctness criteria can't be checked with a regex or a substring
 * match — "is this explanation appropriately non-technical", "does this
 * apology sound sincere and offer a concrete next step". For those, the
 * standard technique is to have a SEPARATE model call grade the response
 * against an explicit rubric, using structured output (Level 1, Ex.3) so
 * the grade itself is a real boolean/number you can aggregate, not more
 * prose you'd have to parse by hand.
 *
 * Two things worth being deliberate about:
 *   - the rubric must be SPECIFIC. "Is this a good answer?" is a bad
 *     rubric — the judge has nothing concrete to check against, and its
 *     grading becomes just as unreliable as not grading at all.
 *   - ideally the judge model is at least as capable as the model being
 *     graded (harder to fool a judge if it's not the weaker model in the
 *     room). Here they're the same model for simplicity — fine for
 *     learning, worth revisiting in a real eval pipeline. If you're
 *     running a small local model, consider pointing the judge at a
 *     bigger Ollama Cloud model instead via a second env var.
 */
import { client, MODEL, getText, parseJSON } from "../llm-client.js";

const JUDGE_MODEL = process.env.OLLAMA_JUDGE_MODEL || MODEL;

/**
 * @param {object} opts
 * @param {string} opts.question       - what the model being tested was asked
 * @param {string} opts.response       - what the model being tested answered
 * @param {string} opts.rubric         - the specific, checkable pass criteria
 * @returns {Promise<{pass: boolean, score: number, reasoning: string}>}
 */
export async function judgeResponse({ question, response, rubric }) {
  const judgeReply = await client.chat.completions.create({
    model: JUDGE_MODEL,
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content:
          "You are a strict grader. You will be given a question, a response to " +
          "grade, and a specific rubric. Judge ONLY against the rubric — do not " +
          "apply your own separate opinion of what a 'good answer' looks like. " +
          "Respond with ONLY raw JSON, no markdown fences, no commentary, using " +
          'EXACTLY this shape: {"pass": true|false, "score": 1-5, "reasoning": "..."}',
      },
      {
        role: "user",
        content:
          `QUESTION:\n${question}\n\n` +
          `RESPONSE TO GRADE:\n${response}\n\n` +
          `RUBRIC (the response passes only if it satisfies this):\n${rubric}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "grade",
        strict: true,
        schema: {
          type: "object",
          properties: {
            pass: { type: "boolean" },
            score: { type: "integer", description: "1 (fails badly) to 5 (fully satisfies the rubric)" },
            reasoning: { type: "string", description: "one or two sentences justifying the grade" },
          },
          required: ["pass", "score", "reasoning"],
          additionalProperties: false,
        },
      },
    },
  });

  return parseJSON(getText(judgeReply));
}
