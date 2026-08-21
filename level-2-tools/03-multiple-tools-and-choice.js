/**
 * LEVEL 2 — Exercise 3: Multiple tools + controlling tool_choice
 *
 * Concepts covered:
 *   - giving the model several tools and letting it pick the right one
 *   - tool_choice: "auto" (default) vs forcing a SPECIFIC tool vs "required"
 *     (must use some tool) vs "none" (tools disallowed for this call)
 *   - why tool descriptions matter A LOT — the model decides which tool
 *     to use (or whether to use one at all) based on the description text
 *
 * Run:  npm run l2:multi
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";

// --- Tool 1: current time in a timezone ---
function getCurrentTime(timezone) {
  try {
    return {
      timezone,
      time: new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date()),
    };
  } catch {
    return {
      error: `Unknown timezone: "${timezone}". Use IANA format, e.g. "Asia/Tokyo".`,
    };
  }
}

// --- Tool 2: a calculator — deliberately NOT using eval() on model input.
// Model-supplied strings are untrusted; this only allows digits/operators. ---
function calculate(expression) {
  if (!/^[\d\s+\-*/().]+$/.test(expression)) {
    return { error: "Expression contains characters that aren't allowed." };
  }
  try {
    // Safe here only because we've already restricted the character set above.
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expression});`)();
    return { expression, result: value };
  } catch {
    return { error: `Could not evaluate "${expression}"` };
  }
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description:
        "Get the current date and time in a specific IANA timezone (e.g. 'America/New_York', 'Asia/Tokyo').",
      parameters: {
        type: "object",
        properties: { timezone: { type: "string" } },
        required: ["timezone"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "Evaluate a basic arithmetic expression (+, -, *, /, parentheses). Use this for any math instead of computing it yourself.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "e.g. '(12 + 8) * 3'" },
        },
        required: ["expression"],
      },
    },
  },
];

const toolImplementations = {
  get_current_time: (input) => getCurrentTime(input.timezone),
  calculate: (input) => calculate(input.expression),
};

async function ask(userMessage, toolChoice = "auto") {
  const messages = [{ role: "user", content: userMessage }];

  let response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools,
    tool_choice: toolChoice,
    messages,
  });
  console.log("Initial model response:", JSON.stringify(response, null, 2));
  while (response.choices[0].finish_reason === "tool_calls") {
    const message = response.choices[0].message;
    messages.push(message);

    for (const toolCall of message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(`  -> ${toolCall.function.name}(${JSON.stringify(args)})`);
      const output = await toolImplementations[toolCall.function.name](args);
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      });
    }

    // Only force tool_choice on the FIRST call — once results come back, let
    // the model respond normally (forcing a tool on every turn would loop forever).
    response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      tools,
      messages,
    });
    console.log("Last model response:", JSON.stringify(response, null, 2));
  }

  return response.choices[0].message.content ?? "(no text response)";
}

async function main() {
  console.log("--- 1. auto: model picks the right tool on its own ---");
  console.log(await ask("What time is it in Tokyo?"));

  console.log("\n--- 2. auto: model picks the OTHER tool ---");
  console.log(await ask("What is 847 * 12 - 3?"));

  console.log("\n--- 3. auto: no tool needed at all ---");
  console.log(await ask("What's the capital of France?"));

  console.log(
    "\n--- 4. forced: make it use calculate even for a trivial case ---",
  );
  console.log(
    await ask("What is 2 + 2?", {
      type: "function",
      function: { name: "calculate" },
    }),
  );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
