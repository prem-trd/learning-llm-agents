/**
 * LEVEL 2 — Exercise 1: A single tool call, step by step
 *
 * Concepts covered:
 *   - defining a "tool" (name, description, a JSON Schema for its inputs —
 *     exactly like the response_format you used in Level 1 Ex.3)
 *   - the model doesn't call your function directly. It replies with a
 *     "tool_calls" entry saying "please call this function with these
 *     arguments." YOUR code executes the real function.
 *   - you send the result back as a message with role "tool", and the
 *     model uses it to write the final answer.
 *
 * OpenAI-compatible tool shape (what Ollama uses):
 *   - tool definitions are wrapped: {type: "function", function: {name, description, parameters}}
 *   - the model's request lives at message.tool_calls[i].function.{name, arguments}
 *   - `arguments` is a JSON STRING you must parse yourself (not a parsed object)
 *   - each tool result becomes its own message: {role: "tool", tool_call_id, content}
 *
 * This file spells out every step manually (no loop, no helper) so the
 * mechanics are visible. Exercise 2 wraps this in a proper loop.
 *
 * Run:  npm run l2:single
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";

// --- Step 0: the "tool" is just a function + a schema describing its inputs ---
// Here we fake the data so the exercise doesn't depend on any external API.
function getWeather(location) {
  const fakeData = {
    paris: { tempC: 14, condition: "cloudy" },
    tokyo: { tempC: 22, condition: "sunny" },
    delhi: { tempC: 31, condition: "hazy" },
  };
  const key = location.toLowerCase();
  return (
    fakeData[key] ?? { tempC: 20, condition: "unknown (no data for this city)" }
  );
}

// This is what we tell the model the tool looks like. It never sees the
// JS function above — it only sees this description and decides WHEN and
// HOW to call it (i.e., with what arguments).
const weatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    description:
      "Get the current weather for a city. Call this whenever the user asks " +
      "about current weather conditions or temperature in a specific place.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city name, e.g. 'Paris' or 'Tokyo'",
        },
      },
      required: ["location"],
    },
  },
};

async function main() {
  const messages = [
    { role: "user", content: "Is it warm in Tokyo right now?" },
  ];

  console.log("--- Step 1: send the message + tool definitions ---\n");
  const first = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [weatherTool],
    messages,
  });
  console.log(JSON.stringify(first, null, 2));
  const message = first.choices[0].message;
  console.log("finish_reason:", first.choices[0].finish_reason);
  // "tool_calls" means: the model wants to call a tool before it can answer.
  // (If it were "stop", the model already had enough info to reply directly.)

  const toolCall = message.tool_calls?.[0];
  if (!toolCall) {
    console.log("Model answered directly, no tool needed:", message.content);
    return;
  }

  console.log("\nModel wants to call:", toolCall.function.name);
  const args = JSON.parse(toolCall.function.arguments); // arguments arrives as a JSON STRING
  console.log("With arguments:", args);
  console.log("Tool call id:", toolCall.id, "(we must echo this back)");

  console.log("\n--- Step 2: WE execute the real function ---\n");
  const result = getWeather(args.location);
  console.log("Real function result:", result);

  console.log(
    "\n--- Step 3: send the result back, continuing the conversation ---\n",
  );
  // Push the assistant's message EXACTLY as received (it carries tool_calls),
  // then one "tool" message per tool call, matched by tool_call_id.
  messages.push(message);
  messages.push({
    role: "tool",
    tool_call_id: toolCall.id, // must match the id from step 1 exactly
    content: JSON.stringify(result),
  });

  const second = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [weatherTool], // keep the tool defs on every request in the conversation
    messages,
  });
  console.log(JSON.stringify(second, null, 2));
  console.log(
    "finish_reason:",
    second.choices[0].finish_reason,
    "(now it should be 'stop')\n",
  );
  console.log("Final answer:\n" + second.choices[0].message.content);
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
