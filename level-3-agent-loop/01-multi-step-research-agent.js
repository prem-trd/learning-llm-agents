/**
 * LEVEL 3 — Exercise 1: A real multi-step agent
 *
 * The task below CANNOT be answered from a single tool call. To answer it,
 * the model has to:
 *   1. Realize it needs to know the capital of two countries
 *   2. Call get_capital twice
 *   3. Realize it now needs the weather in each capital
 *   4. Call get_weather twice
 *   5. Compare the two results and answer
 *
 * WE never write that plan anywhere in our code. We just hand the model
 * two tools and a question, and the agent LOOP (agent.js) lets it work
 * through the steps on its own, one "LLM -> Tool -> Observe" cycle at a time.
 * This is the difference between Level 2 (you call a tool) and Level 3
 * (the model plans a sequence of tool calls to reach a goal).
 *
 * Run:  npm run l3:research
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";
import { runAgent } from "./agent.js";

// --- Tool 1: real API, no key needed (restcountries.com) ---
async function getCapital(country) {
  const res = await fetch(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=capital,name`,
  );
  if (!res.ok) return { error: `No country found matching "${country}"` };
  const data = await res.json();
  const entry = Array.isArray(data) ? data[0] : data;
  console.log(
    `Found country:data for "${country}":`,
    JSON.stringify(entry, null, 2),
    JSON.stringify(data, null, 2),
  );
  return {
    country: entry.name?.common ?? country,
    capital: entry.capital?.[0] ?? "unknown",
  };
}

// --- Tool 2: real API, no key needed (Open-Meteo, same as Level 2) ---
async function getWeather(location) {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
  );
  const geo = await geoRes.json();
  if (!geo.results?.length)
    return { error: `Could not find location "${location}"` };
  const { latitude, longitude, name } = geo.results[0];

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m`,
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
      parameters: {
        type: "object",
        properties: { country: { type: "string" } },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current real-time temperature for a city.",
      parameters: {
        type: "object",
        properties: { location: { type: "string" } },
        required: ["location"],
      },
    },
  },
];

const toolImplementations = {
  get_capital: (input) => getCapital(input.country),
  get_weather: (input) => getWeather(input.location),
};

async function main() {
  const result = await runAgent({
    client,
    model: MODEL,
    system:
      "You are a research assistant. Use the tools available to gather facts " +
      "before answering — never guess a capital city or a temperature.",
    tools,
    toolImplementations,
    userMessage:
      "Which is colder right now: the capital of India, or the capital of USA?",
    maxIterations: 6,
  });

  console.log("\n=== Final answer ===");
  console.log(result.text);

  console.log(
    `\n(${result.iterations} tool-use turns, ` +
      `${result.usage.totalInputTokens} input + ${result.usage.totalOutputTokens} output tokens total)`,
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
