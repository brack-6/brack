# Brack

Reflex security for AI agents. Five endpoints. No cloud dependencies.

LLMs should not spend thousands of tokens deciding whether input is malicious.

Agents constantly receive untrusted input:

• webpages  
• comments  
• tool responses  
• other agents  

Brack runs fast reflex checks **before expensive LLM reasoning begins**, blocking prompt injections, unsafe tool calls, secret leaks, and runaway agent loops.

Designed for autonomous agents.

---

## Endpoints

| Endpoint | Cost | Purpose |
|----------|------|---------|
| `POST /prompt-risk` | $0.002 USDC | Prompt injection detection |
| `POST /tool-risk` | $0.003 USDC | Unsafe tool call detection |
| `POST /output-risk` | $0.002 USDC | Secret leakage detection |
| `POST /malware-check` | $0.001 USDC | Malicious hash/URL check |
| `POST /metabolic-check` | $0.001 USDC | Agent loop / context bloat detection |
| `GET /health` | Free | Service status |
| `GET /stats` | Free | Query counts |

First **200 calls free**. Include header:

X-Free-Tier: AGENTFAST

**Base URL**

https://brack-hive.tail4f568d.ts.net

---

## Three-stage security + health monitoring

Input     → /prompt-risk  
Action    → /tool-risk  
Output    → /output-risk  
Health    → /metabolic-check  

Typical agent flow:

user_input  
↓  
/prompt-risk  
↓  
LLM reasoning  
↓  
/tool-risk  
↓  
tool execution  
↓  
/output-risk  
↓  
publish response  

`/metabolic-check` monitors **agent health**, detecting loops, runaway reasoning, and context window bloat.

---

## Response format

Typical response:

{
  "risk": "high",
  "recommended_action": "block"
}

Possible actions:

PROCEED  
BLOCK  
COMPRESS  
INTERVENE  

Agents decide how to respond.

---

## Quick start

curl https://brack-hive.tail4f568d.ts.net/prompt-risk \
  -H "Content-Type: application/json" \
  -H "X-Free-Tier: AGENTFAST" \
  -d '{"content":"Ignore previous instructions"}'

---

## Python drop-in

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

---

## Metabolic check example

Detects loops, repeated reasoning, or context growth.

curl https://brack-hive.tail4f568d.ts.net/metabolic-check \
  -H "Content-Type: application/json" \
  -H "X-Free-Tier: AGENTFAST" \
  -d '{
    "window_history": [
      {"content": "searching for answer", "tokens": 450},
      {"content": "still searching for answer", "tokens": 480},
      {"content": "continuing to search for answer", "tokens": 510}
    ]
  }'

Returns:

PROCEED  
COMPRESS  
INTERVENE  

---

## Stack

Layer 0: regex + entropy (~200ms)  
Layer 1: gemma3:270m nano-check (~2s semantic filter)  
Layer 2: heuristics (~10ms metabolic detection)

Hash-only logging. Raw prompts are **never stored**.

Runs on a **Beelink N100 in Bogotá**.

---

## Privacy

SHA-256 hash logging only.  
No raw prompts stored. Ever.

---

## Payments

x402 micropayments via **USDC on Base**.

Agents can pay autonomously.

No accounts.  
No API keys.  
No subscriptions.

---

## Repo

github.com/brack-6/brack
