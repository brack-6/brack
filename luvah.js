// ═══════════════════════════════════════════════════════════════
// LUVAH — The Failure Matcher
// Faculty: Emotion / Value / Risk / What You Cannot Bear to Lose
// "The road of excess leads to the palace of wisdom." — Blake
//
// Luvah is passion and sacrifice. He governs what we are
// attached to — and therefore what we cannot see clearly.
// His blindspot: the failure mode we are most emotionally
// invested in not seeing.
// This classifier matches reasoning against known failure patterns.
// ═══════════════════════════════════════════════════════════════

const LUVAH_TAXONOMY = {

  // ── The 8 Failure Modes ────────────────────────────────────────
  //
  // Each type has:
  //   id          — machine key
  //   name        — human label  
  //   question    — what Luvah asks
  //   pattern     — how this failure manifests
  //   warning     — the emotional attachment that blinds you to it
  //   example     — concrete instance

  failures: [

    {
      id:         "premature_scaling",
      name:       "Premature Scaling",
      question:   "Is the plan trying to scale before the core loop is proven?",
      pattern:    "Building infrastructure for 1000 users before 10 users have validated the concept.",
      warning:    "Attachment to the vision of scale makes the present reality invisible.",
      example:    "Building distributed infrastructure before a single customer has validated the core loop.",
    },

    {
      id:         "local_maxima",
      name:       "Local Maxima Trap",
      question:   "Is the plan optimising something that is not the actual constraint?",
      pattern:    "Getting very good at the wrong thing. Polishing the wrong surface.",
      warning:    "Attachment to craft and progress makes the real bottleneck invisible.",
      example:    "Perfecting the onboarding UI while the core payment flow is still broken.",
    },

    {
      id:         "complexity_collapse",
      name:       "Complexity Collapse",
      question:   "Will the system become too complex to debug or maintain under pressure?",
      pattern:    "Each addition seems reasonable in isolation. The system becomes unnavigable.",
      warning:    "Attachment to completeness makes the cost of each addition invisible.",
      example:    "Multiple services — proxy, backend, auth, gateway, and tunnel — each adding failure surface silently.",
    },

    {
      id:         "single_point",
      name:       "Single Point of Failure",
      question:   "Does the plan depend on one component, service, or person without a fallback?",
      pattern:    "Everything routes through one thing. That thing fails. Everything fails.",
      warning:    "Attachment to elegance makes redundancy feel wasteful.",
      example:    "All requests gated through one external service with no fallback when it's unreachable.",
    },

    {
      id:         "revenue_delay",
      name:       "Revenue Delay",
      question:   "Is the plan deferring revenue until after a condition that may never be met?",
      pattern:    "We will charge once X is ready. X is never quite ready.",
      warning:    "Attachment to the perfect product makes the imperfect shippable one invisible.",
      example:    "Waiting until the complete product experience is ready before charging for the working core.",
    },

    {
      id:         "invisible_dependency",
      name:       "Invisible Dependency",
      question:   "Does the plan depend on something external that is not under your control?",
      pattern:    "The plan works perfectly — assuming the third party cooperates.",
      warning:    "Attachment to the plan makes its external dependencies feel internal.",
      example:    "Payment flow depending on a third-party blockchain infrastructure and their approval process.",
    },

    {
      id:         "identity_risk",
      name:       "Identity Risk",
      question:   "Is the creator too identified with the plan to abandon it if evidence demands?",
      pattern:    "The plan becomes who you are. Failure of the plan feels like failure of self.",
      warning:    "Attachment to identity makes contrary evidence feel like personal attack.",
      example:    "The product vision is so compelling it overrides evidence that demands a pivot.",
    },

    {
      id:         "hardware_ceiling",
      name:       "Hardware Ceiling",
      question:   "Will the plan hit a hard physical limit before it proves itself?",
      pattern:    "The hardware runs out of RAM or CPU before the revenue arrives to upgrade.",
      warning:    "Attachment to what you have built makes the ceiling feel further away than it is.",
      example:    "Running concurrent model calls on hardware already at 80% RAM utilisation.",
    },

  ],
};

// ── Luvah classifier prompt ──────────────────────────────────────

function luvahPrompt(reasoning) {
  const typeList = LUVAH_TAXONOMY.failures
    .map(f => `${f.id}: ${f.question}`)
    .join("\n");

  return {
    system: `You are a classifier. Return ONLY valid JSON. No explanation. No preamble. No code fences.`,

    prompt: `Reasoning: "${reasoning}"

Which of these failure mode IDs are present in the reasoning above? Return only IDs that clearly apply. Maximum 3.
${typeList}

Return JSON like: {"found": ["revenue_delay", "identity_risk"], "critical": "revenue_delay", "note": "one sentence"}`,
  };
}

// ── Luvah role config (plug into nano-swarm) ─────────────────────

const LUVAH_ROLE = {
  key:         "luvah",
  faculty:     "Emotion / Value / Risk",
  buildPrompt: luvahPrompt,
  parse: (raw) => {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return { found: [], critical: null, note: raw };
      const parsed = JSON.parse(match[0]);
      const VALID = new Set(LUVAH_TAXONOMY.failures.map(f => f.id));
      const signals = (parsed.found || []).filter(id => VALID.has(id)).slice(0, 3);
      const priority = VALID.has(parsed.critical) ? parsed.critical : (signals[0] || null);
      const failures = signals.map(id => LUVAH_TAXONOMY.failures.find(f => f.id === id));
      return { signals, priority, confidence: null, note: parsed.note || null, failures };
    } catch {
      return { found: [], critical: null, note: raw };
    }
  },
};

// ── Standalone test ──────────────────────────────────────────────
//
// curl -X POST http://localhost:3201/blindspot/luvah \
//   -H "Content-Type: application/json" \
//   -d '{
//     "reasoning": "We should finish the full White Horse pub experience
//                   before promoting BrackOracle. Once everything works
//                   perfectly we can charge. The vision is too important
//                   to compromise with an incomplete product."
//   }'
//
// Expected output:
// {
//   "found": ["revenue_delay", "identity_risk", "local_maxima"],
//   "critical": "revenue_delay",
//   "note": "Waiting for perfect before charging means the hardware ceiling arrives before revenue does.",
//   "failures": [ ...full taxonomy entries... ],
//   "faculty": "Emotion / Value / Risk"
// }

export { LUVAH_ROLE, LUVAH_TAXONOMY, luvahPrompt };
