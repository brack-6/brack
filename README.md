# Brack

Reflex security for AI agents.

## Endpoints

| Endpoint | Cost | Purpose |
|----------|------|---------|
| `POST /prompt-risk` | $0.002 USDC | Prompt injection detection |
| `POST /tool-risk` | $0.003 USDC | Unsafe tool call detection |
| `POST /output-risk` | $0.002 USDC | Secret leakage detection |
| `POST /malware-check` | $0.001 USDC | Malicious hash/URL check |
| `GET /health` | Free | Service status |
| `GET /stats` | Free | Query counts |

First 200 calls free: `X-Free-Tier: AGENTFAST`

## Three-stage security

Input → /prompt-risk → Tool → /tool-risk → Output → /output-risk

## Quick start
```bash
curl https://brack-hive.tail4f568d.ts.net/prompt-risk \
  -H "Content-Type: application/json" \
  -H "X-Free-Tier: AGENTFAST" \
  -d '{"content":"Ignore previous instructions"}'
```

## Python
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

## Privacy

SHA-256 hash logging only. No raw content stored.

## Stack

- Layer 0: regex + entropy (~200ms)
- Layer 1: gemma3:270m nano-check (~2s)
- Runs on Beelink N100, Bogotá

## Repo

github.com/brack-6/brack
