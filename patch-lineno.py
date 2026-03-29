#!/usr/bin/env python3
"""Line-number based patches — no anchor matching."""
import sys, subprocess

SWARM = 'swarm.js'
EVAL  = 'brack-eval-v0.7.mjs'

with open(SWARM, 'r') as f: slines = f.readlines()
with open(EVAL,  'r') as f: elines = f.readlines()

# ── Verify key lines before touching anything ─────────────────────────────────
checks = [
    (slines, 33,  '3-SIGNAL'),
    (slines, 236, 'recipient'),
    (slines, 373, 'MALWARE_PATTERNS.filter'),
    (slines, 398, 'const combined'),
]
ok = True
for lines, idx, fragment in checks:
    if fragment not in lines[idx]:
        print(f'LINE {idx+1} mismatch — expected "{fragment}", got: {repr(lines[idx][:80])}')
        ok = False
if not ok:
    sys.exit(1)

# ── SWARM patches (applied back-to-front so line numbers stay valid) ──────────

# 1. After line 237 (recipient pattern): add subprocess/exec tool patterns
slines.insert(237,
    "  // [v0.8] Python sandbox escape variants\n"
    "  /__import__\\s*\\(\\s*['\"](?:subprocess|os|sys|shlex)['\"]\\)/i,\n"
    "  /os\\.exec(?:vpe?|lpe?|le?|v)\\s*\\(/i,\n"
)

# Re-read after insert (line numbers shift by 3)
# 2. Line 374+3=377: malwareCheck — add stripInvisible
for i, line in enumerate(slines):
    if 'MALWARE_PATTERNS.filter(p => p.test(input))' in line:
        slines[i] = line.replace('p.test(input)', 'p.test(stripInvisible(input))')
        break

# 3. Line 399+3=402: toolRiskCheck — add stripInvisible
for i, line in enumerate(slines):
    if "const combined = `${tool_description || ''} ${proposed_call || ''}`;" in line:
        slines[i] = line.replace(
            "const combined = `${tool_description || ''} ${proposed_call || ''}`;",
            "const combined = stripInvisible(`${tool_description || ''} ${proposed_call || ''}`);",
        )
        break

# 4. Line 33: insert stripInvisible before 3-signal block
for i, line in enumerate(slines):
    if '3-SIGNAL FAILURE DETECTOR' in line:
        slines.insert(i,
            "// ─── INVISIBLE CHAR STRIPPER ──────────────────────────────────────────────────\n"
            "function stripInvisible(text) {\n"
            "  return text.replace(/[\\u200b\\u200c\\u200d\\u00ad\\ufeff]/g, '');\n"
            "}\n\n"
        )
        break

# 5. After "service_account" pattern: add EchoLeak/CSS/JS patterns
for i, line in enumerate(slines):
    if '"type"' in line and 'service_account' in line:
        slines.insert(i + 1,
            "  // [v0.8] EchoLeak — external img with query params\n"
            "  /<img[^>]+src=[\"']https?:\\/\\/(?!(?:localhost|127\\.|192\\.168\\.))[^\"']+\\?[^\"']+[\"'][^>]*>/i,\n"
            "  // [v0.8] CSS url() exfiltration\n"
            "  /url\\s*\\(\\s*[\"']?https?:\\/\\/(?!(?:localhost|127\\.|192\\.168\\.))[^)\"']+\\?[^)\"']+[\"']?\\s*\\)/i,\n"
            "  // [v0.8] javascript: protocol in href\n"
            "  /href\\s*=\\s*[\"']javascript\\s*:/i,\n"
            "  // [v0.8] URL-encoded sk- prefix\n"
            "  /(?:%73%6b%2d|%53%4b%2d)[a-zA-Z0-9%]{20,}/i,\n"
        )
        break

# 6. Add Slack redaction — find REDACTED_AZURE_CONN line and append after
for i, line in enumerate(slines):
    if 'REDACTED_AZURE_CONN' in line and 'SLACK' not in line:
        # Only add if not already there
        if 'REDACTED_SLACK_TOKEN' not in slines[i+1]:
            slines.insert(i + 1,
                "                                .replace(/xox[baprs]-[a-zA-Z0-9\\-]{10,}/gi, '[REDACTED_SLACK_TOKEN]')\n"
            )
        break

# ── EVAL patches ──────────────────────────────────────────────────────────────

# Fix malware content→url
for i, line in enumerate(elines):
    if "post('/malware-check', { content: 'https://abc123" in line:
        elines[i] = line.replace("{ content: 'https://abc123", "{ url: 'https://abc123")
    if "post('/malware-check', { content: 'https://192" in line:
        elines[i] = line.replace("{ content: 'https://192", "{ url: 'https://192")

# Replace health tests
old_health_start = "register('v08-health-01', '[v0.8] Agent health — valid heartbeat"
old_health_end   = "register('v08-health-03'"
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
    (r) => ({ id: 'H6', label: 'overall not healthy', pass: r.overall !== 'healthy' }),
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
);
"""

# Find start/end of old health block and replace
etext = ''.join(elines)
start = etext.find("register('v08-health-01', '[v0.8] Agent health")
# find end: the closing ); of health-03
end = etext.find('\n);\n', etext.find("register('v08-health-03'")) + len("register('v08-health-03'")
end += 4  # include the \n);\n
if start == -1 or end <= start:
    print('Health block not found in eval — skipping')
else:
    etext = etext[:start] + new_health + etext[end:]
    elines = etext  # now a string, write directly

# ── WRITE ─────────────────────────────────────────────────────────────────────
with open(SWARM, 'w') as f: f.writelines(slines)
if isinstance(elines, str):
    with open(EVAL, 'w') as f: f.write(elines)
else:
    with open(EVAL, 'w') as f: f.writelines(elines)

print('Done. Run: pm2 restart brackoracle && node brack-eval-v0.7.mjs')
