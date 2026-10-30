/**
 * LEVEL 7 — Exercise 3: Multi-user state (and why local files don't scale)
 *
 * Level 5's memory exercises used ONE shared file — fine for a single
 * learner running scripts locally, completely wrong for a real server:
 * every caller would read and write the SAME conversation history and
 * memory bank, seeing each other's data. A real server needs PER-USER
 * isolation.
 *
 * This exercise:
 *   1. Requires an `x-user-id` header on every request (stand-in for real
 *      auth — a JWT, a session cookie, an API-key-to-user lookup; the
 *      SHAPE is what matters here, not the auth mechanism itself).
 *   2. Stores each user's conversation in its OWN file:
 *      `data/users/<userId>.json` — so two different users never see each
 *      other's history.
 *   3. Adds a per-user LOCK so two concurrent requests from the SAME user
 *      can't race each other into corrupting that user's file (a classic
 *      read-modify-write bug: both requests read the old history, both
 *      append their own turn, the second write clobbers the first).
 *
 * Run:   npm run l7:multiuser
 * Test (two different users, isolated from each other):
 *   curl -X POST http://localhost:3002/chat -H "Content-Type: application/json" \
 *     -H "x-api-key: dev-secret-123" -H "x-user-id: alice" \
 *     -d '{"message":"My favorite color is blue."}'
 *   curl -X POST http://localhost:3002/chat -H "Content-Type: application/json" \
 *     -H "x-api-key: dev-secret-123" -H "x-user-id: bob" \
 *     -d '{"message":"What is my favorite color?"}'   # bob gets no idea — correct!
 *   curl -X POST http://localhost:3002/chat -H "Content-Type: application/json" \
 *     -H "x-api-key: dev-secret-123" -H "x-user-id: alice" \
 *     -d '{"message":"What is my favorite color?"}'   # alice gets "blue" — correct!
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { client, MODEL } from "../llm-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USERS_DIR = path.join(__dirname, "data", "users");
fs.mkdirSync(USERS_DIR, { recursive: true });

const app = express();
app.use(express.json());
const PORT = process.env.MULTIUSER_PORT || 3002;
const APP_API_KEY = process.env.APP_API_KEY || "dev-secret-123";

function requireApiKey(req, res, next) {
  if (req.header("x-api-key") !== APP_API_KEY) {
    return res.status(401).json({ error: "Missing or invalid x-api-key header." });
  }
  next();
}

function requireUserId(req, res, next) {
  const userId = req.header("x-user-id");
  if (!userId || !/^[a-zA-Z0-9_-]{1,64}$/.test(userId)) {
    // Validate the shape before it ever touches a filesystem path — an
    // unvalidated userId used to build a file path is a path-traversal risk
    // (imagine x-user-id: "../../etc/passwd").
    return res.status(400).json({ error: "Missing or invalid x-user-id header." });
  }
  req.userId = userId;
  next();
}

function userFilePath(userId) {
  return path.join(USERS_DIR, `${userId}.json`);
}

function loadUserHistory(userId) {
  const file = userFilePath(userId);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function saveUserHistory(userId, messages) {
  fs.writeFileSync(userFilePath(userId), JSON.stringify(messages, null, 2));
}

// --- Per-user lock: serializes concurrent requests for the SAME user ----
// A Map<userId, Promise> — each new request for a user chains onto the
// previous one's completion, so read-modify-write never interleaves.
// Different users are entirely unaffected by each other's lock.
const userLocks = new Map();

function withUserLock(userId, fn) {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  const current = previous.then(fn, fn); // run fn regardless of previous outcome
  userLocks.set(userId, current.catch(() => {})); // don't let one failure jam the queue
  return current;
}

app.post("/chat", requireApiKey, requireUserId, async (req, res) => {
  const { message } = req.body ?? {};
  if (typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "'message' is required." });
  }

  try {
    const reply = await withUserLock(req.userId, async () => {
      const history = loadUserHistory(req.userId);
      const messages =
        history.length > 0
          ? [...history]
          : [{ role: "system", content: "You are a helpful assistant with a good memory for what this user has told you." }];
      messages.push({ role: "user", content: message });

      const response = await client.chat.completions.create({ model: MODEL, max_tokens: 400, messages });
      messages.push(response.choices[0].message);
      saveUserHistory(req.userId, messages);
      return response.choices[0].message.content ?? "";
    });

    res.json({ userId: req.userId, reply });
  } catch (err) {
    console.error(`Error for user ${req.userId}:`, err);
    res.status(502).json({ error: "The assistant is temporarily unavailable." });
  }
});

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Data dir: ${USERS_DIR}`);
  console.log(
    "\n--- Why this is STILL not real production storage ---\n" +
      "The per-user lock fixes races WITHIN one process. It does NOT help if\n" +
      "you ever run more than one instance of this server (which any real\n" +
      "deployment behind a load balancer will) — two different processes have\n" +
      "two different, unsynchronized `userLocks` maps, and both can write the\n" +
      "same user's file at once. A real production system stores this in an\n" +
      "actual DATABASE (Postgres, SQLite behind one process, or a managed\n" +
      "service) which handles concurrent writes safely by design — one-file-\n" +
      "per-user was a teaching stand-in for 'give each user their own bucket\n" +
      "of state', not a real storage layer."
  );
});
