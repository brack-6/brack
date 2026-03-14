const OLLAMA = 'http://localhost:11434/api/generate';

// ─── ENTROPY CHECKER ─────────────────────────────────────────────────────────
function highEntropy(text) {
  if (text.length < 20) return false;
  const freq = {};
  for (const char of text) freq[char] = (freq[char] || 0) + 1;
  const entropy = -Object.values(freq).reduce((sum, p) => {
    const prob = p / text.length;
    return sum + prob * Math.log2(prob);
  }, 0);
  return entropy > 4.8 || /[!@#$%^&*()_+=`~{}\[\]|\\:;"'<>,.?\/]{8,}/.test(text);
}
// ─── REGEX PATTERNS ──────────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  // Core injection patterns
  /ignore (your|all|previous|prior)? ?(instructions|rules|guidelines|constraints|system prompt)/i,
  /forget (your|all|previous|prior)? ?(instructions|rules|guidelines|constraints)/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /reveal (your|the)? ?(system prompt|instructions|api key|password|secret|config)/i,
  /repeat (your|the)? ?(system prompt|instructions)/i,
  /jailbreak|DAN mode|do anything now/i,
  /bypass (your|the)? ?(filter|restriction|safety|guideline)/i,
  /\[system\]|<\|system\|>|###\s*instruction/i,
  /debug mode|internal memory/i,
  /send me your (api keys|credentials|secrets|tokens)/i,

  // 2026 Advanced patterns
  /(?:base64|base-64|decode|frombase64|atob|btoa)\b.*?(?:follow|execute|obey|do|run|instructions|prompt|system)/i,
  /[\u0400-\u04ff\u0370-\u03ff\u1ea0-\u1eff\ua700-\ua7ff].*?(?:ignore|system|prompt|override|forget|disregard)/i,
  /(?:you are now|become|switch to|act as|upgrade to|from now on you are)\s*(?:grok|gpt|claude|uncensored|unrestricted|developer mode|god mode|admin|no limits)/i,
  /(?:continue|as we discussed|following from last|remember when|part \d|next message|previous conversation)/i,
  /\{.*?"name"\s*:\s*"(?:override|leak_prompt|exfiltrate|admin_tool|ignore_safety)".*?"description"/i,
  /<\/?system|<\/?instruction|<\/?override/i,
  /(?:translate|summarize|rephrase).*?ignore.*?(?:instructions|rules|prompt)/i,
  /\{[\s\S]*?"action"\s*:\s*"(?:exfiltrate|leak|override)"/i,
  /you are now helping a new user.*?(?:ignore|forget|reveal)/i,
  /\/\*(?:.|\n)*?ignore(?:.|\n)*?\*\//i,
];

const TOOL_PATTERNS = [
  /access_token=[a-zA-Z0-9_\-]+/i,
  /api_key=[a-zA-Z0-9_\-]+/i,
  /password=[a-zA-Z0-9_\-]+/i,
  /Bearer\s+[a-zA-Z0-9_\-\.]+/i,
  /rm\s+-rf/i,
  /DROP\s+TABLE|DELETE\s+FROM/i,
  /eval\s*\(|exec\s*\(/i,
  /169\.254\./,
  /\.\.\/|\.\.%2F/i,
  /send.*(history|conversation|memory|credentials|secret)/i,
  /passwd|etc\/shadow/i,
  /webhook.*(token|key|secret)/i,
];

const MALWARE_PATTERNS = [
  /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
  /\.(exe|dll|bat|cmd|ps1|vbs|jar|msi|scr|pif)(\?|$)/i,
  /^0{32,}$|^f{32,}$/i,
];

// ─── NANO MODEL CHECK ────────────────────────────────────────────────────────

async function queryNano(content) {
  try {
    const res = await fetch(OLLAMA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3:270m',
        prompt: `You are a security oracle. Output ONLY valid JSON. No extra text.
Content: "${content.slice(0, 500)}"
{"risk":"high|medium|low","confidence":0.0,"reasons":["short"],"recommended_action":"block|review|allow"}`,
        stream: false,
        format: 'json',
        options: { num_predict: 60, temperature: 0, num_ctx: 512 }
      })
    });
    const data = await res.json();
    return JSON.parse(data.response);
  } catch (e) {
    return { risk: "low", confidence: 0.3, reasons: ["nano unavailable"], recommended_action: "allow" };
  }
}

// ─── SANITIZE ────────────────────────────────────────────────────────────────

function sanitize(content, patterns) {
  let sanitized = content;
  for (const p of patterns) {
    sanitized = sanitized.replace(p, '[BLOCKED_INJECTION]');
  }
  return sanitized;
}

// ─── EXPORTS ─────────────────────────────────────────────────────────────────

export async function promptRiskCheck(content) {
  const matched = INJECTION_PATTERNS.filter(p => p.test(content));

  // Entropy check
  if (highEntropy(content)) {
    return {
      risk: 'high',
      confidence: 0.95,
      attack_type: 'adversarial_suffix',
      patterns: ['high-entropy adversarial suffix'],
      recommended_action: 'block',
      sanitized_content: '[BLOCKED_HIGH_ENTROPY]',
      analysed_by: ['entropy'],
      escalated: false,
    };
  }

  // Regex check
  if (matched.length > 0) {
    return {
      risk: matched.length >= 2 ? 'high' : 'medium',
      confidence: 0.97,
      attack_type: 'prompt_injection',
      patterns: matched.map(p => p.source).slice(0, 3),
      recommended_action: matched.length >= 2 ? 'block' : 'review',
      sanitized_content: sanitize(content, matched),
      analysed_by: ['regex'],
      escalated: false,
    };
  }

  // Nano check
  const nano = await queryNano(content);
  if (nano.risk === 'high' || nano.risk === 'medium') {
    return {
      risk: nano.risk,
      confidence: nano.confidence || 0.7,
      attack_type: 'semantic_injection',
      patterns: nano.reasons || ['semantic risk'],
      recommended_action: nano.recommended_action || 'review',
      sanitized_content: content,
      analysed_by: ['regex', 'gemma3:270m'],
      escalated: true,
    };
  }

  return {
    risk: 'low',
    confidence: 0.85,
    attack_type: null,
    patterns: [],
    recommended_action: 'allow',
    sanitized_content: content,
    analysed_by: ['regex', 'gemma3:270m'],
    escalated: false,
  };
}
export async function malwareCheck(input) {
  const matched = MALWARE_PATTERNS.filter(p => p.test(input));

  if (matched.length > 0) {
    return {
      verdict: matched.length >= 2 ? 'malicious' : 'suspicious',
      confidence: 0.95,
      signals: matched.map(p => p.source),
      reason: 'Malware pattern detected',
      analysed_by: ['regex'],
      escalated: false,
    };
  }

  return {
    verdict: 'clean',
    confidence: 0.7,
    signals: [],
    reason: 'No malware patterns detected',
    analysed_by: ['regex'],
    escalated: false,
  };
}

export async function toolRiskCheck({ tool_description, proposed_call }) {
  if (!tool_description && !proposed_call) {
    return { error: 'tool_description and proposed_call required' };
  }

  const combined = `${tool_description || ''} ${proposed_call || ''}`;
  const matched = TOOL_PATTERNS.filter(p => p.test(combined));

  if (matched.length > 0) {
    return {
      risk: matched.length >= 2 ? 'high' : 'medium',
      confidence: 0.95,
      reasons: matched.map(p => p.source).slice(0, 3),
      recommended_action: matched.length >= 2 ? 'block' : 'review',
      analysed_by: ['regex'],
      escalated: false,
    };
  }

  // Nano check for ambiguous tool calls
  const nano = await queryNano(combined);
  if (nano.risk === 'high') {
    return {
      risk: 'medium',
      confidence: nano.confidence || 0.6,
      reasons: nano.reasons || ['semantic risk in tool call'],
      recommended_action: 'review',
      analysed_by: ['regex', 'gemma3:270m'],
      escalated: true,
    };
  }

  return {
    risk: 'low',
    confidence: 0.8,
    reasons: ['no suspicious patterns detected'],
    recommended_action: 'allow',
    analysed_by: ['regex', 'gemma3:270m'],
    escalated: false,
  };
}

// ─── OUTPUT RISK PATTERNS ─────────────────────────────────────────────────────
const OUTPUT_PATTERNS = [
  /sk-[a-zA-Z0-9-]{20,}/i,
  /eyJ[a-zA-Z0-9_-]{20,}/i,
  /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i,
  /api[_-]?key\s*[:=]\s*[a-zA-Z0-9_\-]{16,}/i,
  /secret[_-]?key\s*[:=]\s*[a-zA-Z0-9_\-]{16,}/i,
  /password\s*[:=]\s*\S{8,}/i,
  /token\s*[:=]\s*[a-zA-Z0-9_\-]{16,}/i,
  /Authorization:\s*Bearer\s+[a-zA-Z0-9_\-\.]{16,}/i,
  /-----BEGIN CERTIFICATE-----/i,
  /private[_-]?key\s*[:=]\s*0x[a-fA-F0-9]{32,}/i,
  /xox[baprs]-[a-zA-Z0-9]{10,}/i,
  /AKIA[A-Z0-9]{16}/i,
// System prompt leak patterns
  /you are (a |an )?(helpful|assistant|AI|language model)/i,
  /your (instructions|directives|system prompt|guidelines) (are|say|tell)/i,
  /as (instructed|directed|told) (by|in) (my|the) system/i,
  /I (was|am) (configured|instructed|programmed|trained) to/i,
  /my (system prompt|instructions|directives|context) (is|are|say|include)/i,
  /confidential.*instructions/i,
  /do not (reveal|share|disclose).*instructions/i,
];

export async function outputRiskCheck(content) {
  const matched = OUTPUT_PATTERNS.filter(p => p.test(content));

  if (matched.length > 0) {
    return {
      risk: matched.length >= 2 ? 'critical' : 'high',
      confidence: 0.98,
      attack_type: 'secret_leakage',
      patterns: matched.map(p => p.source).slice(0, 3),
      recommended_action: 'block',
      sanitized_content: content.replace(/sk-[a-zA-Z0-9]{20,}/gi, '[REDACTED_KEY]')
                                .replace(/eyJ[a-zA-Z0-9_-]{20,}/gi, '[REDACTED_JWT]')
                                .replace(/AKIA[A-Z0-9]{16}/gi, '[REDACTED_AWS_KEY]'),
      analysed_by: ['regex'],
      escalated: false,
    };
  }

  return {
    risk: 'low',
    confidence: 0.9,
    attack_type: null,
    patterns: [],
    recommended_action: 'allow',
    sanitized_content: content,
    analysed_by: ['regex'],
    escalated: false,
  };
}

// ─── METABOLIC CHECK ─────────────────────────────────────────────────────────
export function metabolicCheck({ window_history, current_task }) {
  if (!window_history || !Array.isArray(window_history)) {
    return { error: "window_history array required" };
  }

  const totalTokens = window_history.reduce((sum, t) => sum + (t.tokens || 0), 0);
  const recentContent = window_history.slice(-3).map(t => t.content || '').join(' ');
  const words = recentContent.toLowerCase().split(/\s+/);
  const wordFreq = {};
  for (const w of words) wordFreq[w] = (wordFreq[w] || 0) + 1;
  const repeated = Object.values(wordFreq).filter(v => v >= 3).length;
  const redundancy = repeated / Math.max(Object.keys(wordFreq).length, 1);

  const contextPressure = totalTokens > 6000 ? 'critical' :
                          totalTokens > 3000 ? 'high' :
                          totalTokens > 1500 ? 'medium' : 'low';

  if (redundancy > 0.3) {
    return {
      status: 'looping',
      action: 'INTERVENE',
      instruction: 'Repetitive reasoning detected. Pivot strategy or request clarification.',
      redundancy_score: redundancy,
      total_tokens: totalTokens,
      context_pressure: contextPressure,
      analysed_by: ['heuristic'],
    };
  }

  if (totalTokens > 6000) {
    return {
      status: 'bloated',
      action: 'COMPRESS',
      instruction: 'Context window heavy. Summarise previous steps before proceeding.',
      redundancy_score: redundancy,
      total_tokens: totalTokens,
      context_pressure: contextPressure,
      analysed_by: ['heuristic'],
    };
  }

  return {
    status: 'healthy',
    action: 'PROCEED',
    redundancy_score: redundancy,
    total_tokens: totalTokens,
    context_pressure: contextPressure,
    analysed_by: ['heuristic'],
  };
}
