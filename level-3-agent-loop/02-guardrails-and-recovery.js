/**
 * LEVEL 3 — Exercise 2: Guardrails — tool failures and runaway loops
 *
 * Real tools fail: APIs time out, inputs are invalid, services are down.
 * A production agent has to handle that WITHOUT crashing or hallucinating
 * a made-up answer. Two things to see here:
 *
 *   1. A tool that fails on the first try. We report the failure back
 *      inside the tool result's content (OpenAI-compatible tool messages
 *      have no dedicated "is_error" flag — the model has to see the error
 *      in the text itself), and the model adapts — usually by trying
 *      again with different input, or telling the user it couldn't help.
 *
 *   2. What happens when the model genuinely can't make progress: the
 *      maxIterations safety cap in agent.js throws instead of looping forever.
 *      This is a deliberate, controlled failure — much better than an
 *      agent silently consuming your API budget overnight.
 *
 * Run:  npm run l3:guardrails
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";
import { runAgent } from "./agent.js";

// --- A tool that fails the first time it's called with a bad store ID,
// to simulate a real API rejecting invalid input. ---
async function lookupStoreInventory(storeId) {
  const validStores = { "store-1": 42, "store-2": 17 };
  if (!(storeId in validStores)) {
    // Throwing here is exactly what a real fetch()/DB call failing looks like.
    // agent.js catches this and reports it back to the model in the tool result.
    throw new Error(`Store "${storeId}" does not exist. Valid IDs: ${Object.keys(validStores).join(", ")}`);
  }
  return { storeId, unitsInStock: validStores[storeId] };
}

// --- A tool that ALWAYS fails, no matter what — used to demonstrate the
// maxIterations cap kicking in below. ---
async function alwaysBrokenTool() {
  throw new Error("Service temporarily unavailable (simulated permanent outage).");
}

const inventoryTools = [
  {
    type: "function",
    function: {
      name: "lookup_store_inventory",
      description: "Look up units in stock for a given store ID (e.g. 'store-1').",
      parameters: {
        type: "object",
        properties: { storeId: { type: "string" } },
        required: ["storeId"],
      },
    },
  },
];

const brokenTools = [
  {
    type: "function",
    function: {
      name: "check_order_status",
      description: "Check the shipping status of an order by ID.",
      parameters: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
    },
  },
];

async function main() {
  console.log("--- 1. A tool that fails once, then the model recovers ---\n");
  console.log(
    "(We ask about 'store-99', which doesn't exist. Watch the model see the\n" +
      "error and course-correct — real behavior depends on the model, so this\n" +
      "might succeed by asking you to clarify, or apologize; either is fine.)\n"
  );

  const result1 = await runAgent({
    client,
    model: MODEL,
    system: "You help check store inventory. If a lookup fails, explain the problem to the user clearly.",
    tools: inventoryTools,
    toolImplementations: { lookup_store_inventory: (input) => lookupStoreInventory(input.storeId) },
    userMessage: "How many units are in stock at store-99?",
    maxIterations: 4,
  });
  console.log("Final answer:", result1.text);

  console.log("\n--- 2. A tool that ALWAYS fails -> maxIterations cap trips ---\n");
  try {
    await runAgent({
      client,
      model: MODEL,
      system: "You help check order status using the available tool.",
      tools: brokenTools,
      toolImplementations: { check_order_status: () => alwaysBrokenTool() },
      userMessage: "What's the status of order #4471?",
      maxIterations: 2, // deliberately tiny, so the cap trips quickly for this demo
    });
  } catch (err) {
    console.log("Caught expected guardrail error:");
    console.log(`  ${err.message}`);
    console.log(
      "\nThis is the correct outcome: the agent kept retrying a genuinely broken\n" +
        "tool, and the cap stopped it instead of letting it (and its token spend)\n" +
        "run forever. In production you'd catch this and show the user a clean\n" +
        "'something went wrong, please try again later' message."
    );
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err.message ?? err);
  process.exit(1);
});
