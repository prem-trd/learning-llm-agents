/**
 * LEVEL 3 — Exercise 3: Inspecting the trace + tracking cost
 *
 * agent.js already records every tool call into a `trace` array and sums
 * token usage across every turn of the loop (usage is per-REQUEST, but an
 * agent makes many requests — you have to add them up yourself). This
 * exercise is about actually USING that data:
 *
 *   - a clean, step-by-step record of what the agent did and why
 *   - a token usage report for the whole multi-turn run
 *
 * A note on cost: Ollama Cloud's pricing (and whether it's even metered
 * per-token vs a flat plan) can differ from a pay-per-token API — check
 * ollama.com's current pricing for your account. Local Ollama has no
 * per-token cost at all; the "cost" there is your own electricity/GPU
 * time. So this exercise reports usage, and leaves the $ conversion as a
 * placeholder you'd fill in based on your actual plan.
 *
 * This is a direct preview of two later levels:
 *   - Level 6 (Evaluation) — you can't measure "is the agent correct" without
 *     a record of what it actually did at each step.
 *   - Level 7 (Production/Monitoring) — you can't control cost or debug a
 *     production incident without exactly this kind of trace + usage log.
 *
 * Run:  npm run l3:trace
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";
import { runAgent } from "./agent.js";

async function getCapital(country) {
  const res = await fetch(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=capital,name`
  );
  if (!res.ok) return { error: `No country found matching "${country}"` };
  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : data;
  return { country: entry.name?.common ?? country, capital: entry.capital?.[0] ?? "unknown" };
}

async function getWeather(location) {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`
  );
  const geo = await geoRes.json();
  if (!geo.results?.length) return { error: `Could not find location "${location}"` };
  const { latitude, longitude, name } = geo.results[0];
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`
  );
  const weather = await weatherRes.json();
  return { location: name, temperature_c: weather.current.temperature_2m };
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_capital",
      description: "Look up the capital city of a country.",
      parameters: { type: "object", properties: { country: { type: "string" } }, required: ["country"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current real-time temperature for a city.",
      parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
    },
  },
];

const toolImplementations = {
  get_capital: (input) => getCapital(input.country),
  get_weather: (input) => getWeather(input.location),
};

function printTraceReport(result) {
  console.log("\n=== Step-by-step trace ===");
  for (const step of result.trace) {
    const status = step.isError ? "FAILED" : "ok";
    console.log(`  turn ${step.turn} [${status}]  ${step.tool}(${JSON.stringify(step.input)})`);
    console.log(`           -> ${JSON.stringify(step.output)}`);
  }

  console.log("\n=== Usage report ===");
  console.log(`  Prompt tokens:     ${result.usage.totalInputTokens}`);
  console.log(`  Completion tokens: ${result.usage.totalOutputTokens}`);
  console.log(`  Total tokens:      ${result.usage.totalInputTokens + result.usage.totalOutputTokens}`);
  console.log(`  Tool-use turns:    ${result.iterations}`);
  console.log(
    "  (Convert to $ using your Ollama Cloud plan's rate, if metered per-token; " +
      "local Ollama has no per-token $ cost.)"
  );
}

async function main() {
  const result = await runAgent({
    client,
    model: MODEL,
    system: "You are a research assistant. Use the tools before answering — never guess facts.",
    tools,
    toolImplementations,
    userMessage: "Which is colder right now: the capital of Sweden, or the capital of Kenya?",
    maxIterations: 6,
    verbose: false, // suppress the live step-by-step prints — we'll show the trace at the end instead
  });

  console.log("=== Final answer ===");
  console.log(result.text);

  printTraceReport(result);

  console.log(
    "\n--- Why this matters ---\n" +
      "A usage report per RUN, not per request, is what you actually need in\n" +
      "production — an agent that takes 5 tool-use turns costs 5x the API\n" +
      "calls of a single prompt. If costs (or rate limits) surprise you later,\n" +
      "this is the kind of instrumentation that explains why."
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
