/**
 * LEVEL 3 — shared helper: a generic agent loop
 *
 * This is the SAME while-loop from Level 2 Exercise 2
 * (`while (finish_reason === "tool_calls") { ... }`), generalized so any
 * exercise in this folder can reuse it. What makes it an "agent" rather
 * than "a tool call" is:
 *
 *   1. It can have MANY tools, and the model decides which to call, in
 *      what order, how many times — WE don't hardcode the sequence.
 *   2. It runs for MULTIPLE turns until the model itself decides it has
 *      enough information to answer (finish_reason becomes "stop").
 *   3. It has a safety cap (maxIterations) — without one, a confused model
 *      (or a buggy tool) can loop forever, burning tokens and money.
 *
 * This is the literal "LLM -> Tool -> Observe -> LLM -> Tool -> Observe ->
 * ... -> Answer" cycle from the curriculum, on the OpenAI-compatible tool
 * shape (tools: [{type:"function", function:{...}}], results sent back as
 * one {role:"tool", tool_call_id, content} message PER tool call).
 */

/**
 * @param {object} opts
 * @param {import("openai").default} opts.client
 * @param {string} opts.model
 * @param {string} [opts.system]
 * @param {object[]} opts.tools            - tool defs: {type:"function", function:{name, description, parameters}}
 * @param {Record<string, Function>} opts.toolImplementations - name -> async (input) => output
 * @param {string} opts.userMessage
 * @param {number} [opts.maxIterations]    - safety cap on tool-use rounds
 * @param {boolean} [opts.verbose]         - print each step as it happens
 */
export async function runAgent({
  client,
  model,
  system,
  tools,
  toolImplementations,
  userMessage,
  maxIterations = 6,
  verbose = true,
}) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: userMessage });

  // We track every step for two reasons: (1) so you can print/inspect the
  // agent's reasoning after the fact, and (2) this is exactly the kind of
  // record you'll need later for Level 6 (Evaluation) and Level 7 (Monitoring).
  const trace = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  let response = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    tools,
    messages,
  });
  totalPromptTokens += response.usage?.prompt_tokens ?? 0;
  totalCompletionTokens += response.usage?.completion_tokens ?? 0;

  console.log("Initial model response:", JSON.stringify(response, null, 2));
  let iterations = 0;

  while (response.choices[0].finish_reason === "tool_calls") {
    iterations++;
    if (iterations > maxIterations) {
      // This is not optional in real systems. An agent with no cap is a
      // blank check — a bad prompt, a flaky tool, or the model getting
      // "stuck" can spin forever, each turn costing real money.
      throw new Error(
        `Agent exceeded maxIterations (${maxIterations}) without reaching a final answer. ` +
          `Stopping to avoid an unbounded loop. Last finish_reason: ${response.choices[0].finish_reason}`,
      );
    }

    const message = response.choices[0].message;

    // The model can "think out loud" in message.content alongside the
    // tool_calls in the SAME response — print it if present, it's useful
    // insight into why it's calling what it's calling.
    if (message.content && verbose)
      console.log(`  [turn ${iterations}] model says: "${message.content}"`);

    messages.push(message);

    for (const toolCall of message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      if (verbose)
        console.log(
          `  [turn ${iterations}] -> ${toolCall.function.name}(${JSON.stringify(args)})`,
        );

      let output;
      let isError = false;
      try {
        output = await toolImplementations[toolCall.function.name](args);
      } catch (err) {
        // OpenAI-compatible tool messages have no dedicated "is_error" flag —
        // encode the failure plainly inside the content instead.
        output = { error: err.message };
        isError = true;
      }

      if (verbose)
        console.log(`  [turn ${iterations}] <- ${JSON.stringify(output)}`);

      trace.push({
        turn: iterations,
        tool: toolCall.function.name,
        input: args,
        output,
        isError,
      });

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      });
    }

    response = await client.chat.completions.create({
      model,
      max_tokens: 1024,
      tools,
      messages,
    });
    console.log("last model response:", JSON.stringify(response, null, 2));
    totalPromptTokens += response.usage?.prompt_tokens ?? 0;
    totalCompletionTokens += response.usage?.completion_tokens ?? 0;
  }

  const finalText = response.choices[0].message.content ?? "(no text response)";

  return {
    text: finalText,
    iterations,
    trace,
    usage: {
      totalInputTokens: totalPromptTokens,
      totalOutputTokens: totalCompletionTokens,
    },
    messages, // full conversation, useful for debugging or continuing the chat
  };
}
