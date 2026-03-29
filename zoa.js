// ═══════════════════════════════════════════════════════════════
// ZOA — The Four Zoas as Cognitive Institution
// 
// Blake knew a mind has four faculties.
// We built four classifiers.
//
// Urizen   — Reason    — finds false assumptions
// Urthona  — Imagination — finds suppressed contradictions  
// Luvah    — Emotion   — finds failure modes you cannot see
// Tharmas  — Sensation — rates what is actually grounded
//
// Four gemma3:270m calls. Parallel. ~2-3 seconds total.
// Each classifier has one job. No shared context.
// The taxonomy is the product.
// ═══════════════════════════════════════════════════════════════

import { URIZEN_ROLE }  from "./urizen.js";
import { URTHONA_ROLE } from "./urthona.js";
import { LUVAH_ROLE }   from "./luvah.js";
import { THARMAS_ROLE } from "./tharmas.js";

const OLLAMA = process.env.OLLAMA_URL      || "http://localhost:11434";
const ORACLE = process.env.BRACKORACLE_URL || "http://localhost:3100";
const MODEL  = process.env.OLLAMA_MODEL    || "gemma3:270m";
const TOKENS = 80;
const ROLES  = [URIZEN_ROLE, URTHONA_ROLE, LUVAH_ROLE, THARMAS_ROLE];

// ── Response cleaning ────────────────────────────────────────────

function cleanResponse(raw) {
  if (!raw) return "";
  let cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : cleaned;
}

// ── Synthesis ────────────────────────────────────────────────────
// Pure logic cross-referencing all four Zoa outputs.
// No model call. No latency. The taxonomy does the work.

const COMBINATIONS = [
  {
    id:        "vision_trap",
    label:     "Vision Attachment Trap",
    requires:  { failures: ["identity_risk", "revenue_delay"] },
    amplified_by: { confidence_max: 1.5 },
    severity:  "critical",
    diagnosis: "Emotional attachment to the vision is blocking revenue on unproven ground. The product feels too important to ship incomplete — but that feeling is the trap.",
  },
  {
    id:        "fragile_complexity",
    label:     "Fragile Complexity",
    requires:  { failures: ["complexity_collapse", "single_point"] },
    severity:  "critical",
    diagnosis: "The system is becoming too complex to debug while also depending on a single point of failure. These compound: when the single point fails, the complexity makes it unfixable.",
  },
  {
    id:        "wrong_surface",
    label:     "Optimising the Wrong Surface",
    requires:  { assumptions: ["linearity"], failures: ["local_maxima"] },
    severity:  "high",
    diagnosis: "The reasoning assumes a straight line from effort to outcome while optimising something that is not the real constraint. Progress is real but in the wrong direction.",
  },
  {
    id:        "contradicted_goal",
    label:     "Contradicted Goal",
    requires:  { contradictions: ["means_end"] },
    also_has:  { failures: ["local_maxima", "premature_scaling", "revenue_delay"] },
    severity:  "high",
    diagnosis: "The methods proposed directly conflict with the stated goal, and at least one failure mode is amplifying the contradiction.",
  },
  {
    id:        "hardware_speculation",
    label:     "Hardware Ceiling on Speculation",
    requires:  { failures: ["hardware_ceiling"] },
    amplified_by: { confidence_max: 1.5 },
    severity:  "high",
    diagnosis: "A physical ceiling is approaching with no empirical evidence that the approach works. The hardware limit may arrive before proof of viability.",
  },
  {
    id:        "rushed_overbuilt",
    label:     "Rushed and Overbuilt",
    requires:  { contradictions: ["urgency_thoroughness"], failures: ["premature_scaling"] },
    severity:  "high",
    diagnosis: "The reasoning demands speed while also building more than the current problem requires. Urgency and over-engineering are pulling in opposite directions.",
  },
  {
    id:        "ungrounded_autonomy",
    label:     "Ungrounded Autonomy Claim",
    requires:  { contradictions: ["autonomy_control", "independence_dependency"] },
    severity:  "medium",
    diagnosis: "The reasoning claims independence or autonomy while simultaneously depending on external systems it does not control.",
  },
  {
    id:        "invisible_collapse",
    label:     "Invisible Dependency Collapse",
    requires:  { failures: ["invisible_dependency", "single_point"] },
    severity:  "high",
    diagnosis: "The plan depends on an external factor outside your control, and there is no fallback. When the dependency fails, everything fails.",
  },
];

function synthesize(zoas) {
  const assumptions    = (zoas.urizen?.signals    || []);
  const contradictions = (zoas.urthona?.signals   || []);
  const failures       = (zoas.luvah?.signals     || []);
  const confidence     = zoas.tharmas?.confidence ?? null;

  const aSet = new Set(assumptions);
  const cSet = new Set(contradictions);
  const fSet = new Set(failures);

  const matched = [];

  for (const combo of COMBINATIONS) {
    const req = combo.requires || {};

    // Check required conditions
    const assumptionsMet     = (req.assumptions    || []).every(id => aSet.has(id));
    const contradictionsMet  = (req.contradictions || []).every(id => cSet.has(id));
    const failuresMet        = (req.failures       || []).every(id => fSet.has(id));

    if (!assumptionsMet || !contradictionsMet || !failuresMet) continue;

    // Check amplifier conditions (optional — increases severity if met)
    let amplified = false;
    if (combo.amplified_by?.confidence_max !== undefined) {
      amplified = confidence !== null && confidence <= combo.amplified_by.confidence_max;
    }

    // Check also_has (optional — at least one must be present)
    let alsoMet = true;
    if (combo.also_has) {
      alsoMet = Object.entries(combo.also_has).some(([type, ids]) => {
        const set = type === "assumptions" ? aSet : type === "contradictions" ? cSet : fSet;
        return ids.some(id => set.has(id));
      });
    }

    if (!alsoMet) continue;

    matched.push({
      id:        combo.id,
      label:     combo.label,
      severity:  amplified && combo.severity === "high" ? "critical" : combo.severity,
      diagnosis: combo.diagnosis,
      amplified,
    });
  }

  // Sort by severity
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  matched.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return {
    combinations:  matched,
    primary:       matched[0] || null,
    severity:      matched[0]?.severity || "none",
    diagnosis:     matched[0]?.diagnosis || null,
  };
}

// ── Single micro-call ────────────────────────────────────────────

async function callZoa(role, reasoning, prompt, goal) {
  const built = role.buildPrompt(reasoning);
  const userPrompt = goal
    ? `Goal: ${goal}\nPrompt: ${prompt || ""}\n\n${built.prompt}`
    : built.prompt;

  try {
    const res = await fetch(`${OLLAMA}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:   MODEL,
        system:  built.system,
        prompt:  userPrompt,
        stream:  false,
        options: { temperature: 0.3, num_predict: TOKENS },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    const raw  = cleanResponse(data.response || "");
    return {
      zoa:     role.key,
      faculty: role.faculty,
      ...role.parse(raw),
    };
  } catch (e) {
    return {
      zoa:     role.key,
      faculty: role.faculty,
      error:   e.message,
    };
  }
}

// ── Safety check ─────────────────────────────────────────────────

async function safetyCheck(text) {
  try {
    const res = await fetch(`${ORACLE}/prompt-risk`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Free-Tier":  "AGENTFAST",
      },
      body:   JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.risk === "high" || data.risk === "critical" || data.blocked;
  } catch {
    return false;
  }
}

// ── Register routes ──────────────────────────────────────────────

function registerZoa(app) {

  app.post("/zoa", async (req, res) => {
    const start = Date.now();
    const { prompt, reasoning, goal } = req.body || {};

    if (!reasoning) {
      return res.status(400).json({
        error: "reasoning is required",
        hint:  "Also provide prompt (what the agent was asked) and goal (what it is trying to achieve)",
      });
    }

    const blocked = await safetyCheck(reasoning);
    if (blocked) {
      return res.status(403).json({ error: "Request blocked by safety filter" });
    }

    // Four Zoas in parallel
    const settled = await Promise.allSettled(
      ROLES.map(role => callZoa(role, reasoning, prompt || "", goal || ""))
    );

    const zoas = {};
    for (const result of settled) {
      if (result.status === "fulfilled") {
        zoas[result.value.zoa] = result.value;
      }
    }

    // Surface top signals
    const assumptions    = zoas.urizen?.assumptions    || [];
    const contradictions = zoas.urthona?.contradictions || [];
    const failures       = zoas.luvah?.failures        || [];
    const confidence     = zoas.tharmas?.confidence    || null;

    // Synthesize — pure logic, no model call
    const synthesis = synthesize(zoas);

    res.json({
      summary: {
        assumption_count:    assumptions.length,
        contradiction_count: contradictions.length,
        failure_count:       failures.length,
        confidence_score:    confidence,
        critical_failure:    zoas.luvah?.priority  || null,
        weakest_evidence:    zoas.tharmas?.weakest || null,
      },
      synthesis,
      zoas,
      model:      MODEL,
      latency_ms: Date.now() - start,
    });
  });

  // ── Individual Zoa routes ────────────────────────────────────────

  for (const role of ROLES) {
    app.post(`/zoa/${role.key}`, async (req, res) => {
      const { reasoning, prompt, goal } = req.body || {};
      if (!reasoning) return res.status(400).json({ error: "reasoning is required" });
      const result = await callZoa(role, reasoning, prompt || "", goal || "");
      res.json(result);
    });
  }
}

export { registerZoa };
