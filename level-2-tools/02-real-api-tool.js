/**
 * LEVEL 2 — Exercise 2: A tool that calls a REAL external API
 *
 * Concepts covered:
 *   - the "tool" function can do anything: hit a REST API, query a database,
 *     read a file. The model doesn't care — it just sees inputs and outputs.
 *   - the proper LOOP shape for tool use, instead of hardcoding two steps:
 *
 *       while (finish_reason === "tool_calls") {
 *         run the tool(s), append results, ask again
 *       }
 *
 *     This is the shape you'll reuse for the rest of your life with any
 *     OpenAI-compatible API.
 *
 * Uses Open-Meteo (https://open-meteo.com) — free, no API key required.
 *
 * Run:  npm run l2:real-api
 */
import "dotenv/config";
import { client, MODEL } from "../llm-client.js";

// --- The real tool: geocode a city name, then fetch its current weather ---
async function getWeather(location) {
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
  );
  const geo = await geoRes.json();
  if (!geo.results || geo.results.length === 0) {
    return { error: `Could not find a location matching "${location}"` };
  }
  console.log("geo response", JSON.stringify(geo, null, 2));
  const { latitude, longitude, name, country } = geo.results[0];

  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,wind_speed_10m,relative_humidity_2m`,
  );
  const weather = await weatherRes.json();
  console.log("weather response", JSON.stringify(weather, null, 2));
  return {
    location: `${name}, ${country}`,
    temperature_c: weather.current.temperature_2m,
    wind_speed_kmh: weather.current.wind_speed_10m,
    humidity_percent: weather.current.relative_humidity_2m,
  };
}

const weatherTool = {
  type: "function",
  function: {
    name: "get_weather",
    description:
      "Get the current real-time weather for a city anywhere in the world.",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name, e.g. 'Berlin' or 'Mumbai'",
        },
      },
      required: ["location"],
    },
  },
};

// Dispatch table: tool name -> the function that actually runs it.
// This pattern scales cleanly once you have more than one tool.
const toolImplementations = {
  get_weather: (input) => getWeather(input.location),
};

async function runToolLoop(userMessage) {
  const messages = [{ role: "user", content: userMessage }];

  let response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [weatherTool],
    messages,
  });
  console.log("Initial model response:", JSON.stringify(response, null, 2));
  // Keep looping as long as the model is asking for tool calls.
  while (response.choices[0].finish_reason === "tool_calls") {
    const message = response.choices[0].message;
    messages.push(message);

    // A single response CAN contain more than one tool call (the model
    // asking for several things at once). Handle all of them, then push
    // each result as its OWN "tool"-role message.
    for (const toolCall of message.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(
        `  -> calling ${toolCall.function.name}(${JSON.stringify(args)})`,
      );

      let output;
      try {
        output = await toolImplementations[toolCall.function.name](args);
      } catch (err) {
        // OpenAI-compatible tool results don't have a dedicated "is_error"
        // flag like some providers do — encode the failure IN the content
        // so the model can see it plainly and react instead of treating a
        // stack trace as real data.
        output = { error: `Tool execution failed: ${err.message}` };
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(output),
      });
    }

    response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [weatherTool],
      messages,
    });
    console.log("Last model response:", JSON.stringify(response, null, 2));
  }

  return response.choices[0].message.content ?? "(no text response)";
}

async function main() {
  console.log("--- Query 1 ---");
  console.log(
    await runToolLoop(
      "What's the weather like in CT-6,7&8,ACTL,Mundra, , DM-061626 right now?",
    ),
  );

  // console.log("\n--- Query 2: something requiring TWO tool calls ---");
  // console.log(
  //   await runToolLoop(
  //     "Compare the current weather in Cairo and Oslo — which one is warmer?",
  //   ),
  // );
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
