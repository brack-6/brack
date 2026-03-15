# Brack — Vision

## What Brack Is Now

Brack is a reflex security and health layer for AI agents.

Fast checks before the LLM runs. No cloud dependencies. Runs on cheap hardware.

Current endpoints:
- `/prompt-risk` — prompt injection detection
- `/tool-risk` — unsafe tool call detection
- `/output-risk` — secret leakage detection
- `/malware-check` — malicious hash/URL check
- `/metabolic-check` — agent loop and bloat detection
- `/agent-health` — full agent vital signs monitor

## The Bigger Idea

Most agent frameworks give the LLM full control over tools.

That creates systems which are hard to audit, hard to secure, and expensive to run.

The architecture we think is missing:

```
LLM proposes actions
Runtime decides what is allowed
```

Separation of planning from execution.

## Agent Command Language (ACL)

A sketch of what this could become.

ACL is a deterministic command language for AI agent execution.

The LLM generates a script. The runtime executes it.

### Core Primitives

Ten commands cover almost every agent workflow:

| Command | Type | Purpose |
|---------|------|---------|
| `fetch` | READ | Retrieve data from a URL or API |
| `search` | READ | Query web, vector DB, or knowledge base |
| `read` | READ | Retrieve stored data |
| `compute` | COMPUTE | Transform data or call an LLM |
| `classify` | COMPUTE | Score or categorize input |
| `compare` | COMPUTE | Rank or select between options |
| `store` | EFFECT | Persist data |
| `send` | EFFECT | Send information externally |
| `pay` | EFFECT | Machine-to-machine micropayment |
| `act` | EFFECT | Execute a real-world action |

### Example Script

```
capabilities {
  network.read
  ai.compute
  storage.write
  email.send
}

limits {
  steps: 10
  ai.compute: 5
}

results = search "latest AI news"
page = fetch $results[0]
risk = classify prompt_injection $page
summary = compute summarize $page
store memory.news_summary $summary
send email user@example.com $summary
```

### Execution Model

- Commands execute sequentially
- Commands cannot spawn arbitrary code
- No implicit state
- EFFECT commands require explicit capability declarations
- Every run produces an auditable log

### Capability Manifests

Scripts declare permissions before execution.

```
capabilities {
  network.read
  payments.send
  storage.write
}
```

The runtime enforces them. A script cannot exceed its declared capabilities even if the LLM generates commands that try to.

### Dynamic Execution

Scripts can generate new commands at runtime, but within strict constraints:

1. No new capabilities — dynamic commands obey the original manifest
2. Execution budget — step and cost limits prevent runaway loops
3. Plan/execute separation — dynamic commands are validated before running

### Where Brack Fits

Brack becomes the security reflex layer inside the ACL runtime.

```
ACL script
↓
capability check
↓
Brack reflex layer  ← /prompt-risk, /tool-risk, /agent-health
↓
deterministic execution
↓
external services
```

The `classify prompt_injection` primitive calls `/prompt-risk`.
The `classify tool_risk` primitive calls `/tool-risk`.
Agent health monitoring runs continuously via `/agent-health`.

### Why This Matters

Current agent systems:

```
LLM → tools → chaos
```

ACL architecture:

```
LLM → script → runtime → controlled execution
```

Agents become auditable, reproducible, and safe.

## The Path

1. **Now** — Brack reflex layer. Working API. Real traffic.
2. **Later** — ACL spec. Minimal runtime prototype.
3. **Eventually** — Brack as the default security plugin in ACL runtimes.

The reflex layer must exist before the runtime makes sense.

Ship Brack first.
