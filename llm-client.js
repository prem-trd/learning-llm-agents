/**
 * Shared LLM client — Ollama (OpenAI-compatible API)
 *
 * Ollama Cloud and local Ollama expose the EXACT same OpenAI-compatible
 * shape at /v1/chat/completions — only the base URL and API key differ.
 * That means switching from Ollama Cloud (now) to a locally-running Ollama
 * (later) is a .env change, not a code change:
 *
 *   Ollama Cloud:  OLLAMA_BASE_URL=https://ollama.com/v1
 *                  OLLAMA_API_KEY=<your real key from ollama.com/settings>
 *                  OLLAMA_MODEL=gpt-oss:120b-cloud   (note the -cloud suffix)
 *
 *   Local Ollama:  OLLAMA_BASE_URL=http://localhost:11434/v1
 *                  OLLAMA_API_KEY=ollama              (ignored locally, any value works)
 *                  OLLAMA_MODEL=gpt-oss:20b            (no -cloud suffix — must be `ollama pull`ed first)
 *
 * Every exercise imports `client` and `MODEL` from here instead of hardcoding
 * either one, so that .env is the only thing you ever need to change.
 */
import OpenAI from "openai";

export const MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b-cloud";

export const client = new OpenAI({
  baseURL: process.env.OLLAMA_BASE_URL || "https://ollama.com/v1",
  // The key is REQUIRED by Ollama Cloud (sent as "Authorization: Bearer <key>"
  // automatically by this SDK) but IGNORED by local Ollama — it just needs
  // to be a non-empty string to satisfy the OpenAI client library.
  apiKey: process.env.OLLAMA_API_KEY || "ollama",
});

/** Pulls the plain text answer out of a chat completion response. */
export function getText(response) {
  return response.choices[0]?.message?.content ?? "";
}

/**
 * Ollama's OpenAI-compatible API has no pre-flight token-counting endpoint
 * (unlike Anthropic's `messages.countTokens`). This is a rough estimate
 * only — real usage numbers are only available AFTER a call, on
 * `response.usage.{prompt_tokens,completion_tokens,total_tokens}`.
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * `response_format` on Ollama is NOT guaranteed to be true grammar-
 * constrained decoding the way it is on OpenAI's own API — support varies
 * by model. In practice some models still wrap the JSON in markdown (a
 * ```json fenced block, a heading, a sentence of commentary) even when you
 * asked for raw JSON. This helper strips that wrapping before parsing.
 *
 * It CANNOT fix a model that ignores your schema's field names outright —
 * if the parsed object is missing fields you asked for, that's the model
 * not honoring the schema, and the fix is a bigger/more capable model
 * (set OLLAMA_MODEL), not more parsing code.
 */
export function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to the recovery attempts below
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }

  const braced = text.match(/[{[][\s\S]*[}\]]/);
  if (braced) {
    try {
      return JSON.parse(braced[0]);
    } catch {
      // fall through
    }
  }

  throw new Error(`Could not parse JSON out of the model's output:\n${text}`);
}
