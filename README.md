# Learning: LLM → Agent → Production

Hands-on curriculum, plain JavaScript, using **Ollama** (Ollama Cloud now,
local Ollama later — same code either way, see Setup below).

## Roadmap

1. **LLM basics** — prompts, tokens, context, structured output
2. **Tools** — teaching the LLM to call functions/APIs
3. **Agent Loop** — LLM → Tool → Observe → LLM → Tool → Answer
4. **RAG** — retrieval-augmented generation from your own documents
5. **Memory** — the agent remembers useful state across turns/sessions
6. **Evaluation** — measuring whether the agent is actually correct
7. **Production** — security, monitoring, cloud deployment, multi-user

## Setup (do this once)

```bash
npm install
cp .env.example .env
# then edit .env and paste a free key from https://ollama.com/settings
```

`llm-client.js` at the repo root is the ONE place every exercise gets its
model client from — it reads `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`, and
`OLLAMA_MODEL` from `.env`. That's deliberate: switching from **Ollama
Cloud** (what `.env.example` is set up for right now) to **local Ollama**
later is a `.env` edit only, never a code change:

|                   | Ollama Cloud (now)        | Local Ollama (later)                                            |
| ----------------- | ------------------------- | --------------------------------------------------------------- |
| `OLLAMA_BASE_URL` | `https://ollama.com/v1`   | `http://localhost:11434/v1`                                     |
| `OLLAMA_API_KEY`  | your real key             | ignored — any placeholder works                                 |
| `OLLAMA_MODEL`    | e.g. `gpt-oss:120b-cloud` | e.g. `gpt-oss:20b` (`ollama pull` it first, no `-cloud` suffix) |

Everything here is built on Ollama's **OpenAI-compatible** API
(`/v1/chat/completions` via the `openai` npm package pointed at a custom
`baseURL`) — not every local model supports tool calling or structured
output as reliably as a large cloud model, so if an exercise misbehaves
once you're local, try a bigger/more capable model first before assuming
the code is wrong.

## Level 1 — run the exercises in order

```bash
npm run l1:basic       # system/user messages, streaming
npm run l1:tokens       # what tokens are, estimating vs. real usage, context window
npm run l1:structured   # forcing JSON-shaped output via response_format
```

## Level 2 — Tools (teaching the LLM to call functions/APIs)

```bash
npm run l2:single       # one tool call, every step spelled out manually
npm run l2:real-api     # a tool that hits a real REST API (Open-Meteo, no key needed) + the proper while-loop shape
npm run l2:multi        # multiple tools, tool_choice ("auto" / forced), letting the model pick
```

Read each file top to bottom before running it — the comments are the lesson.
Then run it, tweak something (the prompt, the schema, the tool descriptions),
and re-run to see how the model's behavior changes.

## Level 3 — Agent Loop (LLM → Tool → Observe → LLM → ... → Answer)

```bash
npm run l3:research     # a task needing FOUR chained tool calls the model plans itself
npm run l3:guardrails   # a tool that fails and the model recovers, + the maxIterations safety cap tripping
npm run l3:trace        # inspecting the full step-by-step trace + a token usage report
```

`level-3-agent-loop/agent.js` is a small shared `runAgent()` helper — the
generic version of the `while (finish_reason === "tool_calls")` loop from
Level 2, now built to run multiple turns with multiple tools, cap runaway
loops with `maxIterations`, and record a `trace` + token usage for every
step. All three exercises import it instead of re-writing the loop each
time — that's the first real reusable module in this repo.

Read each file top to bottom before running it, then try breaking things on
purpose: lower `maxIterations` to 1 and see it trip, or feed `l3:research` a
country that doesn't exist and watch the model handle the tool's error.

## Level 4 — RAG (getting knowledge from your own documents)

```bash
npm run l4:chunking      # splitting documents into retrievable chunks (no API call)
npm run l4:retrieval     # a from-scratch search index (TF-IDF + cosine similarity), no API call
npm run l4:rag           # the full pipeline: retrieve -> inject as context -> ask the model -> grounded answer + citations
npm run l4:agentic-rag   # retrieval as a TOOL the Level 3 agent decides when/how to call
```

`level-4-rag/docs/` is a small fictional customer-support knowledge base
(pricing, refunds, security, support hours) used as the "your own data" for
every exercise. `level-4-rag/rag-utils.js` implements chunking and a
dependency-free retrieval index using TF-IDF + cosine similarity — not real
embeddings (which would mean a second provider/API key just to learn the
concept), but the exact same pipeline shape: documents → chunks → vectors →
similarity search → top-k.

`l4:chunking` and `l4:retrieval` don't call the model at all — retrieval is
a pure search problem over your own data; generation only enters once you
get to `l4:rag`. `l4:agentic-rag` reuses the exact `runAgent()` helper from
Level 3 — retrieval becomes just another tool the model chooses to call.

## Level 5 — Memory (remembering things ACROSS sessions)

```bash
npm run l5:persist -- "My name is Alex and my favorite language is Rust."
npm run l5:persist -- "What's my name, and what language do I like?"
npm run l5:facts          # extracting durable facts instead of replaying a full transcript
npm run l5:memory-tool    # the agent decides for itself when to remember/recall, via tools
```

Three escalating approaches, in order:

1. **`l5:persist`** — the simplest kind of memory: save/load the full
   conversation history to a JSON file, so a brand-new process picks up
   where the last one left off. Run it twice with the two commands above (a
   real two-step demo, not simulated) and watch the second run answer using
   what the first run said. The file also calls out why this doesn't scale.
2. **`l5:facts`** — extracts a small number of durable facts from a
   finished conversation (via structured output, Level 1) and stores just
   those. A brand-new conversation loads the facts into the system message
   and "remembers" the user without ever seeing the original transcript.
3. **`l5:memory-tool`** — the agent itself decides when something is worth
   remembering (`remember`) and when to check memory before answering
   (`recall`), via two tools wired into the Level 3 agent loop. `recall`
   reuses the exact retrieval index from Level 4 — searching your own
   memories is the same problem as searching your own documents.

`level-5-memory/data/` holds the generated JSON memory files (gitignored —
they're runtime state, not source). Delete them any time to reset.

## Level 6 — Evaluation (measuring whether the agent is actually correct)

```bash
npm run l6:rules        # deterministic pass/fail checks — cheap, fast, only works when a rule can capture "correct"
npm run l6:judge        # LLM-as-judge grading against a specific rubric, for open-ended quality
npm run l6:regression   # running the same eval suite against two prompt versions to catch regressions
npm run l6:rag-eval     # evaluating Level 4's RAG pipeline: retrieval quality and generation quality, separately
```

- **`l6:rules`** — the cheapest eval: a plain JS function checks the
  response (substring, regex, or — best of all — an exact field match on
  structured output). Deterministic and instant, but only works when
  correctness can be captured mechanically.
- **`l6:judge`** — `level-6-evaluation/judge.js` is a shared helper: a
  second model call grades a response against a specific written rubric
  and returns a structured `{pass, score, reasoning}`. This is the standard
  technique for grading tone, completeness, or any quality a regex can't see.
  (Set `OLLAMA_JUDGE_MODEL` in `.env` to point the judge at a different,
  bigger model than the one being graded — handy once you're on local models.)
- **`l6:regression`** — the actual reason to build an eval suite: run it
  against two system-prompt versions and see, per test case, exactly what
  changed. This is what you'd run in CI before merging a prompt change.
- **`l6:rag-eval`** — revisits Level 4's knowledge base and measures
  retrieval quality (rule-based: was the right document even found?) and
  generation quality (judge-based: did the model use it correctly and stay
  grounded?) as two separate numbers — because a bad RAG answer can come
  from either layer, and they need different fixes.

## Coming next

Level 7 (Production) covers security, monitoring, deployment, and multi-user
concerns — the last mile between "this works when I run it" and "this is a
real service other people rely on." Once you're comfortable with Level 5 and
6, say so and we'll build Level 7 — the final level.
