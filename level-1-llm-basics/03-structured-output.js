/**
 * LEVEL 1 — Exercise 3: Structured output
 *
 * Concepts covered:
 *   - forcing the model to return data in a specific JSON shape
 *     (instead of free-form prose you'd have to parse by hand)
 *   - this is the foundation of Level 2 (Tools) — a tool call IS
 *     structured output under the hood.
 *   - a real caveat: `response_format` support VARIES BY MODEL. On
 *     OpenAI's own API it's true grammar-constrained decoding — the
 *     output literally cannot violate the schema. On Ollama, enforcement
 *     depends on the model, and can be closer to a soft hint: some models
 *     still wrap the JSON in markdown commentary, or drift from your exact
 *     field names. Two defenses, both used below: (1) parse defensively
 *     (`parseJSON` strips markdown fencing before parsing) and (2) restate
 *     the exact shape in plain language in the prompt too — redundant with
 *     the schema, but it measurably improves compliance on weaker
 *     enforcement.
 *
 * Run:  npm run l1:structured
 */
import "dotenv/config";
import { client, MODEL, getText, parseJSON } from "../llm-client.js";

async function main() {
  console.log("--- Extracting structured data from free text ---\n");

  const userText =
    "Hi, I'm Priya Sharma. You can reach me at priya.sharma@example.com. " +
    "I'm interested in the Enterprise plan and would like a demo, ideally next Tuesday.";

  const schema = {
    type: "object",
    properties: {
      name: { type: "string" },
      email: { type: "string" },
      plan_interest: { type: "string" },
      wants_demo: { type: "boolean" },
      requested_day: { type: ["string", "null"] },
    },
    required: ["name", "email", "plan_interest", "wants_demo", "requested_day"],
    additionalProperties: false,
  };

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content:
          "Respond with ONLY raw JSON — no markdown code fences, no headings, " +
          "no commentary before or after. Use EXACTLY these field names: " +
          "name, email, plan_interest, wants_demo, requested_day.",
      },
      { role: "user", content: `Extract contact info from this message:\n\n${userText}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "contact_info", strict: true, schema },
    },
  });

  const rawText = getText(response);
  const data = parseJSON(rawText);

  console.log("Raw model output:");
  console.log(rawText);

  console.log("\nParsed object (real JS object, not a string to regex over):");
  console.log(data);

  const missing = Object.keys(schema.properties).filter((key) => !(key in data));
  if (missing.length > 0) {
    console.log(
      `\n⚠️  The model didn't fully honor the schema — missing/renamed field(s): ${missing.join(", ")}.\n` +
        "   This is a model capability limit, not a bug in this code — try a bigger\n" +
        "   model via OLLAMA_MODEL in .env if this keeps happening."
    );
  } else {
    console.log(`\nname: ${data.name}`);
    console.log(`wants_demo: ${data.wants_demo} (${typeof data.wants_demo})`);
  }

  console.log(
    "\n--- Why this matters ---\n" +
      "Without structured output, you'd ask the model to 'reply in JSON' and\n" +
      "hope it doesn't add explanation text before/after, use single quotes,\n" +
      "or invent extra fields. response_format is supposed to guarantee that —\n" +
      "but as you just saw, 'supposed to' depends on the model actually\n" +
      "honoring it. This is exactly what a 'tool call' is under the hood\n" +
      "(Level 2), and tool-calling reliability varies by model for the same reason."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
