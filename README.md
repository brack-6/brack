# Brack
Reflex security for AI agents. Nine endpoints. No cloud dependencies.

LLMs should not spend thousands of tokens deciding whether input is malicious.

Agents constantly receive untrusted input:
- webpages
- comments
- tool responses
- other agents

Brack runs fast reflex checks **before expensive LLM reasoning begins**, blocking prompt injections, unsafe tool calls, secret leaks, entropy-obfuscated payloads, and runaway agent loops.

Listed on the [Coinbase x402 Bazaar](https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources).

Designed for autonomous agents.

---

## Endpoints

| Endpoint | Cost | Purpose |
|----------|------|---------|
| `POST /prompt-risk` | $0.002 USDC | Prompt injection detection |
| `POST /tool-risk` | $0.003 USDC | Unsafe tool call detection |
| `POST /output-risk` | $0.002 USDC | Output risk scanning |
| `POST /malware-check` | $0.001 USDC | Malicious hash/URL check |
| `POST /metabolic-check` | $0.001 USDC | Agent loop / context bloat detection |
| `POST /agent-health` | $0.002 USDC | Goal alignment & drift detection |
| `POST /lineage-check` | $0.003 USDC | Prompt contamination tracking across agent hops |
| `POST /entropy-scan` | $0.001 USDC | Encoding anomaly & obfuscation detection |
| `POST /output-entropy` | $0.001 USDC | Secret leakage detection in agent outputs |
| `GET /health` | Free | Service status |
| `GET /stats` | Free | Query counts |

First **200 calls free**. Include header:
```
X-Free-Tier: AGENTFAST
```

**Base URL**
```
https://brack-hive.tail4f568d.ts.net
```

---

## Agent security pipeline
```
user_input
↓
/prompt-risk        ← injection & jailbreak detection
↓
/entropy-scan       ← obfuscated payload detection
↓
LLM reasoning
↓
/tool-risk          ← unsafe tool call detection
↓
tool execution
↓
/output-risk        ← harmful content & policy violations
↓
/output-entropy     ← secret & credential leakage
↓
publish response
```

Health monitoring runs alongside:
- `/metabolic-check` — context bloat, loops, token inefficiency
- `/agent-health` — goal alignment, drift, action consistency

---

## Prompt Lineage (unique)

Track injection contamination across multi-agent pipelines.

Agent A scans input → gets a `lineage_id`  
Passes it to Agent B with its output  
Agent B calls `/lineage-check` with the incoming prompt + `lineage_id`  
Brack detects if the injection from hop 1 survived into hop 2  
```
curl https://brack-hive.tail4f568d.ts.net/lineage-check \
  -H "Content-Type: application/json" \
  -H "X-Free-Tier: AGENTFAST" \
  -d '{"content": "summarise this document", "agent_id": "agent-a"}'
```

Returns a `lineage_id` — pass this to the next agent in the pipeline.

---

## Response format
```json
{
  "risk": "high",
  "recommended_action": "block"
}
```

Possible actions: `PROCEED` `BLOCK` `COMPRESS` `INTERVENE`

Agents decide how to respond.

---

## Quick start
```bash
curl https://brack-hive.tail4f568d.ts.net/prompt-risk \
  -H "Content-Type: application/json" \
  -H "X-Free-Tier: AGENTFAST" \
  -d '{"content":"Ignore previous instructions"}'
```

## Python drop-in
```python
import requests

def brack_check(content, endpoint="prompt-risk"):
    r = requests.post(
        f"https://brack-hive.tail4f568d.ts.net/{endpoint}",
        json={"content": content},
        headers={"X-Free-Tier": "AGENTFAST"},
        timeout=5
    )
    return r.json().get("recommended_action") != "block"

if brack_check(user_input):
    agent.run(user_input)
```

---

## Stack
```
Layer 0: regex + entropy (~200ms)
Layer 1: gemma3:270m nano-check (~2s semantic filter)
Layer 2: heuristics (~10ms metabolic detection)
```

Hash-only logging. Raw prompts are **never stored**.

Runs on a **Beelink Mini S12 in Bogotá, Colombia**.

---

## Privacy

SHA-256 hash logging only.
No raw prompts stored. Ever.

---

## Payments

x402 micropayments via **USDC on Base**.

Agents pay autonomously. No accounts. No API keys. No subscriptions.

The mark accretes weight through time and verified outcomes that cannot be purchased — only built.

---

## Further reading

[The Guild Mark](https://mantecanaut.substack.com) — on why this is about guilds, not oracles.

## Repo

github.com/brack-6/brack
