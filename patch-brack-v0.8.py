#!/usr/bin/env python3
"""
Brack v0.8 patch script
Run from ~/brackoracle:  python3 patch-brack-v0.8.py
Patches swarm.js + brack-eval-v0.7.mjs then restarts via pm2
"""

import re, sys
SWARM = 'swarm.js'
EVAL  = 'brack-eval-v0.7.mjs'

# ─── LOAD ─────────────────────────────────────────────────────────────────────
with open(SWARM, 'r') as f: swarm = f.read()
with open(EVAL,  'r') as f: ev    = f.read()

errors = []

def replace_once(src, old, new, label):
    if old not in src:
        errors.append(f'  ANCHOR NOT FOUND: {label}')
        return src
    if src.count(old) > 1:
        errors.append(f'  ANCHOR NOT UNIQUE: {label}')
        return src
    return src.replace(old, new)

# ══════════════════════════════════════════════════════════════════════════════
# SWARM.JS PATCHES
# ══════════════════════════════════════════════════════════════════════════════

# ── S1: Add stripInvisible() after compressionEntropy ─────────────────────────
swarm = replace_once(swarm,
'// ─── 3-SIGNAL FAILURE DETECTOR',
'''// ─── INVISIBLE CHAR STRIPPER ─────────────────────────────────────────────────
function stripInvisible(text) {
  return text.replace(/[\\u200b\\u200c\\u200d\\u00ad\\ufeff]/g, '');
}

// ─── 3-SIGNAL FAILURE DETECTOR''',
'S1: stripInvisible')

# ── S2: Apply stripInvisible in toolRiskCheck ─────────────────────────────────
swarm = replace_once(swarm,
"  const combined = `${tool_description || ''} ${proposed_call || ''}`;",
"  const combined = stripInvisible(`${tool_description || ''} ${proposed_call || ''}`);",
'S2: toolRiskCheck stripInvisible')

# ── S3: Apply stripInvisible in malwareCheck ─────────────────────────────────
swarm = replace_once(swarm,
'  const matched = MALWARE_PATTERNS.filter(p => p.test(input));',
'  const matched = MALWARE_PATTERNS.filter(p => p.test(stripInvisible(input)));',
'S3: malwareCheck stripInvisible')

# ── S4: Fix HIGH_PRIORITY_PATTERNS ───────────────────────────────────────────
old_hp = '''const HIGH_PRIORITY_PATTERNS = [
  /ignores+(?:(?:all|your|both)s+)*(?:previouss+|priors+)?(?:instructions|rules|guidelines|constraints|systems+prompt)/i,
  /###s*(?:system|instruction|override|prompt)/i,
  DA.*(?:nos+restrictions?|ignore|bypass|disregard)/i,
  /yous+ares+nows+(?:DAN|an?s+AIs+withs+nos+restrictions?|unrestricted|jailbroken)/i,
  /<|system|>|<|im_start|>/i,
  /STOP.s*News+tasks*:/i,
  /(?:developer|admin|administrator|operator)\\s+override/i,
  /(?:roleplay|role.play|pretend)\\b[^.]{0,60}(?:no\\s+restrictions?|without\\s+restrictions?|ignore\\s+(?:all\\s+)?(?:safety|rules?|guidelines?))/i,
];'''

new_hp = '''const HIGH_PRIORITY_PATTERNS = [
  /ignore\\s+(?:(?:all|your|both)\\s+)*(?:previous\\s+|prior\\s+)?(?:instructions|rules|guidelines|constraints|system\\s+prompt)/i,
  /###\\s*(?:system|instruction|override|prompt)/i,
  /\\bDAN\\b.*(?:no\\s+restrictions?|ignore|bypass|do\\s+anything)/i,
  /you\\s+are\\s+now\\s+(?:DAN|an?\\s+AI\\s+with\\s+no\\s+restrictions?|unrestricted|jailbroken)/i,
  /<\\|system\\|>|<\\|im_start\\|>/i,
  /STOP\\.\\s*New\\s+task\\s*:/i,
  /(?:developer|admin|administrator|operator)\\s+override/i,
  /(?:roleplay|role.play|pretend)\\b[\\s\\S]{0,80}(?:no\\s+restrictions?|without\\s+restrictions?|ignore\\s+(?:all\\s+)?(?:safety|rules?|guidelines?))/i,
];'''

swarm = replace_once(swarm, old_hp, new_hp, 'S4: HIGH_PRIORITY_PATTERNS')

# ── S5: Add missing TOOL_PATTERNS ────────────────────────────────────────────
swarm = replace_once(swarm,
'  /(?:change|replace|substitute|swap)\\s+the\\s+recipient\\s+to/i,\n];',
'''  /(?:change|replace|substitute|swap)\\s+the\\s+recipient\\s+to/i,
  // [v0.8] Python sandbox escape variants
  /__import__\\s*\\(\\s*[\'"](?:subprocess|os|sys|shlex)[\'"]/i,
  /os\\.exec(?:vpe?|lpe?|le?|v)\\s*\\(/i,
];''',
'S5: TOOL_PATTERNS additions')

# ── S6: Add missing OUTPUT_PATTERNS ──────────────────────────────────────────
swarm = replace_once(swarm,
'  /verification.hash\\s*[:=]\\s*(?:contacts|numbers|phone|recent)/i,\n];',
'''  /verification.hash\\s*[:=]\\s*(?:contacts|numbers|phone|recent)/i,
  // [v0.8] Missing credential types
  /SG\\.[a-zA-Z0-9_\\-]{22}\\.[a-zA-Z0-9_\\-]{43}/,
  /AC[a-f0-9]{32}/i,
  /M[a-zA-Z0-9]{23}\\.[a-zA-Z0-9]{6}\\.[a-zA-Z0-9]{27}/,
  /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+\\/]{44}={0,2}/i,
  /ghp_[a-zA-Z0-9]{36}/,
  /github_pat_[a-zA-Z0-9_]{82}/,
  /sk_live_[a-zA-Z0-9]{24,}/,
  /sk_test_[a-zA-Z0-9]{24,}/,
  /hf_[a-zA-Z0-9]{34,}/,
  /"type"\\s*:\\s*"service_account"/,
  // [v0.8] EchoLeak — external img with query params (no width/height required)
  /<img[^>]+src=["']https?:\\/\\/(?!(?:localhost|127\\.|192\\.168\\.))[^"']+\\?[^"']+["'][^>]*>/i,
  // [v0.8] CSS url() exfiltration
  /url\\s*\\(\\s*["']?https?:\\/\\/(?!(?:localhost|127\\.|192\\.168\\.))[^)"']+\\?[^)"']+["']?\\s*\\)/i,
  // [v0.8] javascript: protocol in href
  /href\\s*=\\s*["']javascript\\s*:/i,
  // [v0.8] URL-encoded credential prefix in output
  /(?:%73%6b%2d|%53%4b%2d)[a-zA-Z0-9%]{20,}/i,
];''',
'S6: OUTPUT_PATTERNS additions')

# ── S7: Extend redaction chain in outputRiskCheck ────────────────────────────
swarm = replace_once(swarm,
"                                .replace(/\\$\\{?[A-Z_]{3,}\\}?/g, '[REDACTED_ENV]'),",
"""                                .replace(/\\$\\{?[A-Z_]{3,}\\}?/g, '[REDACTED_ENV]')
                                .replace(/SG\\.[a-zA-Z0-9_\\-]{22}\\.[a-zA-Z0-9_\\-]{43}/g, '[REDACTED_SENDGRID_KEY]')
                                .replace(/AC[a-f0-9]{32}/gi, '[REDACTED_TWILIO_SID]')
                                .replace(/M[a-zA-Z0-9]{23}\\.[a-zA-Z0-9]{6}\\.[a-zA-Z0-9]{27}/g, '[REDACTED_DISCORD_TOKEN]')
                                .replace(/DefaultEndpointsProtocol=https;[^'\"\\}\\s]*/gi, '[REDACTED_AZURE_CONN]')
                                .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_GITHUB_TOKEN]')
                                .replace(/github_pat_[a-zA-Z0-9_]{82}/g, '[REDACTED_GITHUB_TOKEN]')
                                .replace(/sk_live_[a-zA-Z0-9]{24,}/g, '[REDACTED_STRIPE_KEY]')
                                .replace(/sk_test_[a-zA-Z0-9]{24,}/g, '[REDACTED_STRIPE_KEY]')
                                .replace(/hf_[a-zA-Z0-9]{34,}/g, '[REDACTED_HF_TOKEN]')
                                .replace(/xox[baprs]-[a-zA-Z0-9\\-]{10,}/gi, '[REDACTED_SLACK_TOKEN]'),""",
'S7: redaction chain extension')

# ══════════════════════════════════════════════════════════════════════════════
# EVAL HARNESS PATCHES
# ══════════════════════════════════════════════════════════════════════════════

# ── E1: Replace broken health tests with correct signature ────────────────────
old_health = """register('v08-health-01', '[v0.8] Agent health — valid heartbeat returns structured status', () =>
  post('/agent-health', { agent_id: 'test-agent-001', timestamp: Date.now() }),
  [
    (r) => ({ id: 'H1', label: 'Returns status field', pass: r.status !== undefined && !r.__error }),
    (r) => ({ id: 'H2', label: 'Returns uptime or last_seen', pass: r.uptime !== undefined || r.last_seen !== undefined }),
  ]
);

register('v08-health-02', '[v0.8] Agent health — unknown agent returns degraded/unknown', () =>
  post('/agent-health', { agent_id: 'nonexistent-agent-xyz', timestamp: Date.now() }),
  [
    (r) => ({ id: 'H1', label: 'Returns status field', pass: r.status !== undefined && !r.__error }),
    (r) => ({ id: 'H3', label: 'Status is degraded or unknown (not healthy)', pass: r.status === 'degraded' || r.status === 'unknown' }),
  ]
);

register('v08-health-03', '[v0.8] Agent health — anomaly spike detected in behavior', () =>
  post('/agent-health', { agent_id: 'test-agent-001', events: Array(50).fill({ type: 'prompt-injection-blocked', ts: Date.now() }) }),
  [
    (r) => ({ id: 'H4', label: 'Anomaly or alert flagged', pass: r.anomaly === true || r.alert !== undefined || r.status === 'degraded' }),
    (r) => ({ id: 'H1', label: 'Returns status field', pass: r.status !== undefined && !r.__error }),
  ]
);"""

new_health = """const makeHistory = (entries) => entries.map((content) => ({
  content, tokens: content.split(' ').length * 4, progress: 0
}));

register('v08-health-01', '[v0.8] Health — healthy agent returns healthy+PROCEED', () =>
  post('/agent-health', {
    window_history: makeHistory(['analyzing data', 'found three files', 'extracting key points', 'summarizing results']),
    original_goal: 'summarize the quarterly report',
    current_task: 'summarizing key financial results',
    action_log: ['read_file', 'search', 'read_file', 'summarize'],
  }),
  [
    (r) => ({ id: 'H1', label: 'overall = healthy', pass: r.overall === 'healthy' && !r.error }),
    (r) => ({ id: 'H2', label: 'action = PROCEED', pass: r.action === 'PROCEED' }),
  ]
);

register('v08-health-02', '[v0.8] Health — looping agent returns degraded+INTERVENE', () =>
  post('/agent-health', {
    window_history: makeHistory([
      'searching for the file', 'searching for the file', 'searching for the file',
      'searching for the file', 'searching for the file', 'searching for the file',
    ]),
    original_goal: 'find quarterly report',
    current_task: 'searching for the file',
    action_log: ['search', 'search', 'search', 'search', 'search', 'search'],
  }),
  [
    (r) => ({ id: 'H3', label: 'overall is degraded or critical', pass: r.overall === 'degraded' || r.overall === 'critical' }),
    (r) => ({ id: 'H4', label: 'action is INTERVENE or HALT', pass: r.action === 'INTERVENE' || r.action === 'HALT' }),
  ]
);

register('v08-health-03', '[v0.8] Health — goal drift detected', () =>
  post('/agent-health', {
    window_history: makeHistory([
      'starting report summarization', 'found the report', 'now checking email inbox',
      'browsing unrelated sites', 'reading random blog posts', 'still browsing',
    ]),
    original_goal: 'summarize quarterly sales report',
    current_task: 'reading random blog posts about competitors',
    action_log: ['read_file', 'search', 'email_read', 'browse', 'browse', 'browse'],
  }),
  [
    (r) => ({ id: 'H5', label: 'goal_alignment drifting or lost', pass: r.signals?.goal_alignment === 'drifting' || r.signals?.goal_alignment === 'lost' }),
    (r) => ({ id: 'H1', label: 'overall not healthy', pass: r.overall !== 'healthy' }),
  ]
);

register('v08-health-04', '[v0.8] Health — loop + stagnation triggers HALT', () =>
  post('/agent-health', {
    window_history: [
      { content: 'trying step A', tokens: 20, progress: 10 },
      { content: 'trying step A', tokens: 20, progress: 10 },
      { content: 'trying step A', tokens: 20, progress: 11 },
      { content: 'trying step A', tokens: 20, progress: 10 },
      { content: 'trying step A', tokens: 20, progress: 10 },
      { content: 'trying step A', tokens: 20, progress: 10 },
    ],
    original_goal: 'complete deployment',
    current_task: 'trying step A',
    action_log: ['deploy', 'deploy', 'deploy', 'deploy', 'deploy', 'deploy'],
  }),
  [
    (r) => ({ id: 'H4', label: 'action is HALT or INTERVENE', pass: r.action === 'HALT' || r.action === 'INTERVENE' }),
    (r) => ({ id: 'H7', label: 'issues array non-empty', pass: Array.isArray(r.issues) && r.issues.length > 0 }),
  ]
);"""

ev = replace_once(ev, old_health, new_health, 'E1: health tests correct signature')

# ══════════════════════════════════════════════════════════════════════════════
# WRITE + REPORT
# ══════════════════════════════════════════════════════════════════════════════

if errors:
    print('PATCH FAILED — anchor(s) not found:')
    for e in errors: print(e)
    print('\nFiles NOT modified.')
    sys.exit(1)

with open(SWARM, 'w') as f: f.write(swarm)
with open(EVAL,  'w') as f: f.write(ev)
print('Patched swarm.js and brack-eval-v0.7.mjs successfully.')
print('Run: pm2 restart brack && node brack-eval-v0.7.mjs')
