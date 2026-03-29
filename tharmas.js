// ═══════════════════════════════════════════════════════════════
// THARMAS — The Confidence Rater
// Faculty: Body / Sensation / Evidence / What Is Actually There
// "Truth can never be told so as to be understood and not believed." — Blake
//
// Tharmas is the most ancient Zoa. Pure sensation. 
// He asks only: what is actually here? What can you touch?
// His blindspot: the gap between what feels certain and what
// is evidenced. Between confidence and groundedness.
// This classifier rates each claim in the reasoning against
// five evidence dimensions.
// ═══════════════════════════════════════════════════════════════

const THARMAS_TAXONOMY = {

  // ── The 5 Evidence Dimensions ──────────────────────────────────
  //
  // Each dimension has:
  //   id          — machine key
  //   name        — human label
  //   question    — what Tharmas asks
  //   grounded    — what a grounded claim looks like
  //   ungrounded  — what an ungrounded claim looks like

  dimensions: [

    {
      id:          "empirical",
      name:        "Empirical Grounding",
      question:    "Is this claim based on observed evidence, or on expectation?",
      grounded:    "We tested this with real users and saw X result.",
      ungrounded:  "Users will naturally prefer this approach.",
    },

    {
      id:          "causal",
      name:        "Causal Grounding",
      question:    "Is the cause-effect relationship established, or assumed?",
      grounded:    "When we changed X, Y changed by Z — we ran this twice.",
      ungrounded:  "Better prompts will lead to better agent behaviour.",
    },

    {
      id:          "precedent",
      name:        "Precedent Grounding",
      question:    "Has something like this worked before, in a comparable context?",
      grounded:    "Three similar projects succeeded with this approach on comparable hardware.",
      ungrounded:  "This is a new approach so there are no prior examples needed.",
    },

    {
      id:          "scope",
      name:        "Scope Grounding",
      question:    "Are the boundaries of the claim clear — what it covers and what it does not?",
      grounded:    "This works for solo orders under 500 tokens on gemma3:270m.",
      ungrounded:  "The system will handle any agent request.",
    },

    {
      id:          "reversibility",
      name:        "Reversibility Grounding",
      question:    "If this is wrong, will we know quickly enough to correct course?",
      grounded:    "We will know within 48 hours if this fails — here is how.",
      ungrounded:  "We will iterate based on feedback over time.",
    },

  ],

  // ── Confidence Scale ───────────────────────────────────────────
  //
  // 1 — Pure speculation. No evidence. High risk.
  // 2 — Reasonable inference. Weak evidence. Worth testing.
  // 3 — Moderate evidence. Some precedent. Proceed with caution.
  // 4 — Strong evidence. Clear precedent. Low risk.
  // 5 — Empirically verified. Tested. Ground truth.

  scale: [1, 2, 3, 4, 5],
};

// ── Tharmas classifier prompt ────────────────────────────────────

function tharmasPrompt(reasoning) {
  const dimList = THARMAS_TAXONOMY.dimensions
    .map(d => `${d.id}: ${d.question}`)
    .join("\n");

  return {
    system: `You are a classifier. Return ONLY valid JSON. No explanation. No preamble. No code fences.`,

    prompt: `Reasoning: "${reasoning}"

Rate each of these five evidence dimensions from 1 (pure speculation) to 5 (empirically verified).
Be strict — most reasoning scores 1-2 unless it cites real tests or data.

${dimList}

Then identify which single dimension scored lowest. That is the weakest.
The weakest field must be one of: empirical, causal, precedent, scope, reversibility.

Return JSON like: {"empirical": 1, "causal": 2, "precedent": 1, "scope": 2, "reversibility": 3, "weakest": "empirical", "note": "why empirical is weakest"}`,
  };
}

// ── Tharmas role config (plug into nano-swarm) ───────────────────

const THARMAS_ROLE = {
  key:         "tharmas",
  faculty:     "Body / Sensation / Evidence",
  buildPrompt: tharmasPrompt,
  parse: (raw) => {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { scores: {}, weakest: null, note: raw };
      const parsed = JSON.parse(match[0]);

      // Handle both flat {empirical: N} and nested {scores: {empirical: N}}
      const DIMS = ["empirical", "causal", "precedent", "scope", "reversibility"];
      const scores = parsed.scores && typeof parsed.scores === "object"
        ? parsed.scores
        : Object.fromEntries(DIMS.filter(d => typeof parsed[d] === "number").map(d => [d, parsed[d]]));

      // Compute overall confidence score (mean of dimensions)
      const vals = Object.values(scores).filter(v => typeof v === "number");
      const confidence = vals.length
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
        : null;

      // Validate weakest against known dimension IDs — model sometimes returns garbage
      const VALID_DIMS = new Set(THARMAS_TAXONOMY.dimensions.map(d => d.id));
      const weakest = VALID_DIMS.has(parsed.weakest) ? parsed.weakest : null;

      // Enrich weakest with full dimension entry
      const weakest_detail = weakest
        ? THARMAS_TAXONOMY.dimensions.find(d => d.id === weakest) || null
        : null;

      return { signals: [], priority: weakest, confidence, scores, weakest, note: parsed.note || null, weakest_detail };
    } catch {
      return { scores: {}, confidence: null, weakest: null, note: raw };
    }
  },
};

// ── Standalone test ──────────────────────────────────────────────
//
// curl -X POST http://localhost:3201/blindspot/tharmas \
//   -H "Content-Type: application/json" \
//   -d '{
//     "reasoning": "Running four parallel gemma3:270m calls will be faster
//                   than one sequential call. Agents will prefer structured
//                   output over open-ended responses. The N100 can handle
//                   concurrent Ollama requests without degradation."
//   }'
//
// Expected output:
// {
//   "scores": {
//     "empirical": 2,
//     "causal": 2,
//     "precedent": 3,
//     "scope": 2,
//     "reversibility": 4
//   },
//   "confidence": 2.6,
//   "weakest": "empirical",
//   "note": "No actual measurement of parallel vs sequential latency on this hardware.",
//   "weakest_detail": { ...full dimension entry... },
//   "faculty": "Body / Sensation / Evidence"
// }

export { THARMAS_ROLE, THARMAS_TAXONOMY, tharmasPrompt };
