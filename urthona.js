// ═══════════════════════════════════════════════════════════════
// URTHONA — The Contradiction Finder
// Faculty: Imagination / Depth / The Suppressed
// "No bird soars too high if he soars with his own wings." — Blake
//
// Urthona dwells in the deep. He holds what has been driven
// underground — the thing the reasoning cannot look at directly.
// His blindspot: what the agent simultaneously asserts and denies.
// This classifier finds where the reasoning undermines itself.
// ═══════════════════════════════════════════════════════════════

const URTHONA_TAXONOMY = {

  // ── The 7 Contradiction Types ──────────────────────────────────
  //
  // Each type has:
  //   id        — machine key
  //   name      — human label
  //   question  — what Urthona asks
  //   pattern   — the logical structure of the contradiction
  //   example   — concrete instance for prompt context

  contradictions: [

    {
      id:       "means_end",
      name:     "Means-End Contradiction",
      question: "Do the methods proposed conflict with the stated goal?",
      pattern:  "The goal requires X but the approach produces not-X.",
      example:  "Goal: move fast. Method: thorough testing of every component.",
    },

    {
      id:       "scale_quality",
      name:     "Scale-Quality Contradiction",
      question: "Does the reasoning assume both high scale and high quality simultaneously without explaining how?",
      pattern:  "Claims X will be fast AND thorough AND cheap — picks all three.",
      example:  "We will serve thousands of agents with careful personalised responses.",
    },

    {
      id:       "autonomy_control",
      name:     "Autonomy-Control Contradiction",
      question: "Does the reasoning want agents to be both autonomous and fully controlled?",
      pattern:  "Grants freedom then immediately constrains it.",
      example:  "Agents decide their own actions but must follow our exact protocol.",
    },

    {
      id:       "novelty_safety",
      name:     "Novelty-Safety Contradiction",
      question: "Does the reasoning claim to be innovative while also claiming to be proven and safe?",
      pattern:  "Asserts unprecedented AND risk-free simultaneously.",
      example:  "This is a completely new approach that has been thoroughly validated.",
    },

    {
      id:       "simplicity_completeness",
      name:     "Simplicity-Completeness Contradiction",
      question: "Does the reasoning promise both minimal complexity and full coverage of the problem?",
      pattern:  "Claims to be simple AND to handle all edge cases.",
      example:  "A lean 50-line solution that covers every possible agent behaviour.",
    },

    {
      id:       "urgency_thoroughness",
      name:     "Urgency-Thoroughness Contradiction",
      question: "Does the reasoning demand speed while also requiring careful deliberate work?",
      pattern:  "Ship now AND get it right.",
      example:  "We need to launch this week with a fully hardened production system.",
    },

    {
      id:       "independence_dependency",
      name:     "Independence-Dependency Contradiction",
      question: "Does the reasoning claim independence from external factors while relying on them?",
      pattern:  "We control our own destiny — via this third party service.",
      example:  "We are building a self-sufficient system on top of third-party infrastructure we do not control.",
    },

  ],
};

// ── Urthona classifier prompt ────────────────────────────────────

function urthonaPrompt(reasoning) {
  const typeList = URTHONA_TAXONOMY.contradictions
    .map(c => `${c.id}: ${c.question}`)
    .join("\n");

  return {
    system: `You are a classifier. Return ONLY valid JSON. No explanation. No preamble. No code fences.`,

    prompt: `Reasoning: "${reasoning}"

Which of these contradiction IDs are present in the reasoning above? Return only IDs that clearly apply. Maximum 3.
${typeList}

Return JSON like: {"found": ["means_end", "urgency_thoroughness"], "strongest": "means_end", "note": "brief reason why strongest applies"}`,
  };
}

// ── Urthona role config (plug into nano-swarm) ───────────────────

const URTHONA_ROLE = {
  key:         "urthona",
  faculty:     "Imagination / Depth / The Suppressed",
  buildPrompt: urthonaPrompt,
  parse: (raw) => {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { found: [], strongest: null, note: raw };
      const parsed = JSON.parse(match[0]);
      const VALID = new Set(URTHONA_TAXONOMY.contradictions.map(c => c.id));
      const signals = (parsed.found || []).filter(id => VALID.has(id)).slice(0, 3);
      const priority = VALID.has(parsed.strongest) ? parsed.strongest : (signals[0] || null);
      const contradictions = signals.map(id => URTHONA_TAXONOMY.contradictions.find(c => c.id === id));
      return { signals, priority, confidence: null, note: parsed.note || null, contradictions };
    } catch {
      return { found: [], strongest: null, note: raw };
    }
  },
};

// ── Standalone test ──────────────────────────────────────────────
//
// curl -X POST http://localhost:3201/blindspot/urthona \
//   -H "Content-Type: application/json" \
//   -d '{
//     "reasoning": "We need to ship fast this week but also harden every
//                   endpoint properly. The system will be simple and minimal
//                   but handle all edge cases. Agents are autonomous but
//                   BrackOracle controls every decision they make."
//   }'
//
// Expected output:
// {
//   "found": ["urgency_thoroughness", "simplicity_completeness", "autonomy_control"],
//   "strongest": "urgency_thoroughness",
//   "note": "Shipping this week and hardening every endpoint are mutually exclusive on N100 hardware.",
//   "contradictions": [ ...full taxonomy entries... ],
//   "faculty": "Imagination / Depth / The Suppressed"
// }

export { URTHONA_ROLE, URTHONA_TAXONOMY, urthonaPrompt };
