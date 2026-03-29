// ═══════════════════════════════════════════════════════════════
// URIZEN — The Assumption Checker
// Faculty: Reason / Law / Boundary
// "He who sees the Infinite in all things sees God." — Blake
//
// Urizen imposes order. He draws the circle of what is known.
// His blindspot: he mistakes his map for the territory.
// This classifier finds where the agent has done the same.
// ═══════════════════════════════════════════════════════════════

const URIZEN_TAXONOMY = {

  // ── The 7 Assumption Types ─────────────────────────────────────
  //
  // Each type has:
  //   id       — machine key
  //   name     — human label
  //   question — what Urizen asks
  //   signal   — words/patterns that suggest this assumption is present
  //   example  — concrete instance for prompt context

  assumptions: [

    {
      id:       "resource",
      name:     "Resource Assumption",
      question: "Does the reasoning assume resources (time, money, compute, people) that may not be available?",
      signal:   ["just", "simply", "easily", "we can", "we have", "available"],
      example:  "We can just add more servers if needed.",
    },

    {
      id:       "linearity",
      name:     "Linearity Assumption",
      question: "Does the reasoning assume a straight path from action to outcome, ignoring feedback loops or second-order effects?",
      signal:   ["will", "therefore", "so", "this means", "leads to", "results in"],
      example:  "Better prompts will lead to better outputs.",
    },

    {
      id:       "actor",
      name:     "Actor Assumption",
      question: "Does the reasoning assume other people or systems will behave as expected?",
      signal:   ["users will", "agents will", "they will", "people want", "the model will"],
      example:  "Users will naturally adopt the new workflow.",
    },

    {
      id:       "stability",
      name:     "Stability Assumption",
      question: "Does the reasoning assume the environment will remain stable — that nothing important will change?",
      signal:   ["currently", "right now", "at the moment", "existing", "as it is"],
      example:  "The API will keep working the same way.",
    },

    {
      id:       "knowledge",
      name:     "Knowledge Assumption",
      question: "Does the reasoning assume the agent knows enough to act — that no critical information is missing?",
      signal:   ["we know", "clearly", "obviously", "it's clear", "as we can see"],
      example:  "We know what the user actually wants.",
    },

    {
      id:       "uniqueness",
      name:     "Uniqueness Assumption",
      question: "Does the reasoning assume this situation is unique — ignoring base rates, precedents, or similar past cases?",
      signal:   ["different", "unique", "novel", "unprecedented", "new", "first"],
      example:  "This market is different from previous ones.",
    },

    {
      id:       "reversibility",
      name:     "Reversibility Assumption",
      question: "Does the reasoning assume the decision can be undone if wrong?",
      signal:   ["try", "test", "experiment", "see what happens", "iterate", "adjust"],
      example:  "We can always roll back if it doesn't work.",
    },

  ],
};

// ── Urizen classifier prompt ─────────────────────────────────────
//
// Designed for gemma3:270m — structured input, structured output.
// No open reasoning. Classification only.

function urizenPrompt(reasoning) {
  const typeList = URIZEN_TAXONOMY.assumptions
    .map(a => `${a.id}: ${a.question}`)
    .join("\n");

  return {
    system: `You are a classifier. Return ONLY valid JSON. No explanation. No preamble. No code fences.`,

    prompt: `Reasoning: "${reasoning}"

Which of these assumption IDs are present in the reasoning above? Return only IDs that clearly apply. Maximum 3.
${typeList}

Return JSON like: {"found": ["resource", "linearity"], "strongest": "resource", "note": "brief reason why strongest applies"}`,
  };
}

// ── Urizen role config (plug into nano-swarm) ────────────────────

const URIZEN_ROLE = {
  key:        "urizen",
  faculty:    "Reason / Law / Boundary",
  buildPrompt: urizenPrompt,
  parse: (raw) => {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { found: [], strongest: null, note: raw };
      const parsed = JSON.parse(match[0]);
      const VALID = new Set(URIZEN_TAXONOMY.assumptions.map(a => a.id));
      // Strip anything that isn't a known taxonomy ID
      const signals = (parsed.found || []).filter(id => VALID.has(id)).slice(0, 3);
      const priority = VALID.has(parsed.strongest) ? parsed.strongest : (signals[0] || null);
      const assumptions = signals.map(id => URIZEN_TAXONOMY.assumptions.find(a => a.id === id));
      return { signals, priority, confidence: null, note: parsed.note || null, assumptions };
    } catch {
      return { found: [], strongest: null, note: raw };
    }
  },
};

// ── Standalone test ──────────────────────────────────────────────
//
// curl -X POST http://localhost:3201/blindspot/urizen \
//   -H "Content-Type: application/json" \
//   -d '{
//     "reasoning": "We can just add more endpoints as agents need them.
//                   The existing infrastructure will scale naturally.
//                   Users will adopt the payment flow once they see the value."
//   }'
//
// Expected output:
// {
//   "found": ["resource", "linearity", "actor", "stability"],
//   "strongest": "actor",
//   "note": "Assumes agents and users will behave as intended without evidence.",
//   "assumptions": [ ...full taxonomy entries... ],
//   "faculty": "Reason / Law / Boundary"
// }

export { URIZEN_ROLE, URIZEN_TAXONOMY, urizenPrompt };
