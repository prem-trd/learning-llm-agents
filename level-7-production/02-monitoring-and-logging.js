/**
 * LEVEL 7 — Exercise 2: Monitoring — you can't fix what you can't see
 *
 * Extends Exercise 1's security middleware with the instrumentation every
 * real service needs before you'd trust it in production:
 *
 *   1. STRUCTURED REQUEST LOGGING — one JSON line per request: who, what,
 *      how long it took, how many tokens it cost. Not console.log("done")
 *      — a real log line you could feed into a log aggregator and query.
 *   2. A HEALTH CHECK ENDPOINT — `/health`. This is what a load balancer,
 *      an uptime monitor, or a deployment platform pings to decide "is
 *      this instance alive and should traffic go to it."
 *   3. A METRICS ENDPOINT — `/metrics`. Aggregate counters (total
 *      requests, error rate, average latency, total tokens spent) so you
 *      can see the shape of your traffic, not just individual requests.
 *   4. CENTRALIZED ERROR HANDLING — one place that logs the FULL error
 *      server-side and returns a safe, generic message to the client —
 *      instead of scattering try/catch blocks that might each leak
 *      different amounts of internal detail by accident.
 *
 * Run:   npm run l7:monitoring
 * Test:
 *   curl -X POST http://localhost:3001/chat -H "Content-Type: application/json" \
 *     -H "x-api-key: dev-secret-123" -d '{"message":"What is RAG?"}'
 *   curl http://localhost:3001/health
 *   curl http://localhost:3001/metrics
 */
import "dotenv/config";
import express from "express";
import { client, MODEL, getText } from "../llm-client.js";

const app = express();
app.use(express.json());
const PORT = process.env.MONITORING_PORT || 3001;
const APP_API_KEY = process.env.APP_API_KEY || "dev-secret-123";

function requireApiKey(req, res, next) {
  if (req.header("x-api-key") !== APP_API_KEY) {
    return res.status(401).json({ error: "Missing or invalid x-api-key header." });
  }
  next();
}

function validateChatInput(req, res, next) {
  const { message } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0 || message.length > 2000) {
    return res.status(400).json({ error: "'message' must be a non-empty string under 2000 characters." });
  }
  next();
}

// --- Metrics store (in-memory — see the note at the bottom) -------------
const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  totalLatencyMs: 0,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  startedAt: new Date().toISOString(),
};

// --- 1. Structured request logging middleware --------------------------
// Attaches a requestId and start time to every request, then logs a
// single structured JSON line once the response is sent — this is the
// pattern real log pipelines expect (one parseable event per request).
let requestCounter = 0;

function requestLogger(req, res, next) {
  req.requestId = `req_${++requestCounter}`;
  req.startTime = Date.now();

  res.on("finish", () => {
    const latencyMs = Date.now() - req.startTime;
    console.log(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs,
        apiKeyUsed: req.header("x-api-key") ?? null,
        timestamp: new Date().toISOString(),
      })
    );
  });

  next();
}

app.use(requestLogger);

app.get("/health", (req, res) => {
  // A real health check often also verifies dependencies (e.g. "can we
  // reach Ollama right now?") — kept simple here to show the shape.
  res.json({ status: "ok", uptimeSeconds: process.uptime() });
});

app.get("/metrics", (req, res) => {
  res.json({
    ...metrics,
    errorRate: metrics.totalRequests === 0 ? 0 : metrics.totalErrors / metrics.totalRequests,
    avgLatencyMs: metrics.totalRequests === 0 ? 0 : Math.round(metrics.totalLatencyMs / metrics.totalRequests),
  });
});

app.post("/chat", requireApiKey, validateChatInput, async (req, res, next) => {
  const start = Date.now();
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 500,
      messages: [
        { role: "system", content: "You are a helpful support assistant. Answer clearly and concisely." },
        { role: "user", content: req.body.message },
      ],
    });

    metrics.totalRequests++;
    metrics.totalLatencyMs += Date.now() - start;
    metrics.totalPromptTokens += response.usage?.prompt_tokens ?? 0;
    metrics.totalCompletionTokens += response.usage?.completion_tokens ?? 0;

    res.json({ reply: getText(response), requestId: req.requestId, usage: response.usage });
  } catch (err) {
    metrics.totalRequests++;
    metrics.totalErrors++;
    metrics.totalLatencyMs += Date.now() - start;
    next(err); // hand off to the centralized error handler below
  }
});

// --- 4. Centralized error-handling middleware ---------------------------
// Express recognizes this as an error handler ONLY because it has FOUR
// parameters (err, req, res, next) — that's not stylistic, it's required.
// It must be registered LAST, after every route.
app.use((err, req, res, next) => {
  console.error(JSON.stringify({ requestId: req.requestId, error: err.message, stack: err.stack }));
  res.status(502).json({ error: "The assistant is temporarily unavailable. Please try again.", requestId: req.requestId });
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(
    "\n--- Why in-memory metrics aren't enough in real production ---\n" +
      "This `metrics` object lives in one process's RAM: it resets on every\n" +
      "restart/deploy, and if you run more than one instance behind a load\n" +
      "balancer, each instance only knows about ITS OWN traffic — /metrics\n" +
      "would give a different, incomplete answer depending on which instance\n" +
      "answered your curl. Real production pushes these numbers to a\n" +
      "centralized system (Prometheus, Datadog, CloudWatch, etc.) that\n" +
      "aggregates across every instance. Same lesson as the rate limiter in\n" +
      "Exercise 1, and the same one coming up again with memory in Exercise 3."
  );
});
