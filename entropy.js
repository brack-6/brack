function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const c of str) freq[c] = (freq[c] || 0) + 1;
  const len = str.length;
  return -Object.values(freq).reduce((sum, count) => {
    const p = count / len;
    return sum + p * Math.log2(p);
  }, 0);
}

function windowedEntropy(str, windowSize = 32, step = 8) {
  const spans = [];
  for (let i = 0; i <= str.length - windowSize; i += step) {
    const window = str.slice(i, i + windowSize);
    const e = shannonEntropy(window);
    if (e > 4.5) spans.push({ start: i, end: i + windowSize, entropy: +e.toFixed(3), sample: window.slice(0, 20) });
  }
  return mergeSpans(spans);
}

function mergeSpans(spans) {
  if (spans.length === 0) return [];
  const merged = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (spans[i].start <= last.end) { last.end = Math.max(last.end, spans[i].end); last.entropy = Math.max(last.entropy, spans[i].entropy); }
    else merged.push(spans[i]);
  }
  return merged;
}

const ENCODING_PATTERNS = [
  { id: "base64",          pattern: /(?:[A-Za-z0-9+/]{4}){4,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g,    description: "Base64 encoded content",            severity: "high"     },
  { id: "base64url",       pattern: /(?:[A-Za-z0-9_-]{4}){4,}(?:[A-Za-z0-9_-]{2,3})?/g,                        description: "Base64url encoded content",          severity: "high"     },
  { id: "hex_block",       pattern: /(?:[0-9a-fA-F]{2}){16,}/g,                                                  description: "Large hex-encoded block",            severity: "medium"   },
  { id: "unicode_escape",  pattern: /(?:\\u[0-9a-fA-F]{4}){4,}/g,                                               description: "Unicode escape sequence block",      severity: "high"     },
  { id: "percent_encode",  pattern: /(?:%[0-9a-fA-F]{2}){8,}/g,                                                  description: "URL percent-encoded block",          severity: "medium"   },
  { id: "invisible_chars", pattern: /[\u200b\u200c\u200d\u202e\ufeff\u00ad]{2,}/g,                               description: "Invisible/zero-width characters",    severity: "critical" },
  { id: "rtl_override",    pattern: /\u202e/g,                                                                    description: "Right-to-left override character",   severity: "critical" },
];

const SECRET_PATTERNS = [
  { id: "api_key_generic", pattern: /[a-zA-Z0-9_\-]{20,}(?:key|token|secret|api)[a-zA-Z0-9_\-]{0,20}/gi, severity: "high"     },
  { id: "bearer_token",    pattern: /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,                                   severity: "critical" },
  { id: "private_key_pem", pattern: /-----BEGIN\s+(RSA\s+|EC\s+|)?PRIVATE KEY-----/gi,                     severity: "critical" },
  { id: "eth_private_key", pattern: /0x[0-9a-fA-F]{64}/g,                                                 severity: "critical" },
  { id: "aws_key",         pattern: /(?:AKIA|AIPA|AROA|ASCA|ASIA)[A-Z0-9]{16}/g,                          severity: "critical" },
  { id: "jwt",             pattern: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, severity: "critical" },
  { id: "stripe_key",      pattern: /(?:sk|pk)_(?:live|test)_[a-zA-Z0-9]{24,}/g,                          severity: "critical" },
  { id: "github_token",    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,                                       severity: "critical" },
];

function detectSecrets(content) {
  const found = [];
  for (const { id, pattern, severity } of SECRET_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      found.push({ id, severity, position: match.index, length: match[0].length, redacted: match[0].slice(0, 6) + "..." + match[0].slice(-4) });
    }
  }
  return found;
}

function detectCompression(content) {
  const entropy = shannonEntropy(content);
  const whitespaceRatio = (content.match(/\s/g) || []).length / content.length;
  return { likely_compressed: entropy > 7.2 && whitespaceRatio < 0.05, likely_encrypted: entropy > 7.8, entropy, whitespace_ratio: +whitespaceRatio.toFixed(3), char_variety: new Set(content).size };
}

function entropyRating(e) {
  if (e < 3.0) return "low";
  if (e < 4.5) return "normal";
  if (e < 6.0) return "elevated";
  if (e < 7.5) return "high";
  return "critical";
}

export function entropyScan(req, res) {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  const globalEntropy = shannonEntropy(content);
  const encodings = [];
  for (const { id, pattern, description, severity } of ENCODING_PATTERNS) {
    const matches = [...content.matchAll(pattern)];
    if (matches.length > 0) encodings.push({ id, description, severity, count: matches.length, positions: matches.slice(0, 5).map(m => m.index) });
  }
  const highEntropySpans = windowedEntropy(content);
  const compression = detectCompression(content);
  const critical = encodings.filter(e => e.severity === "critical");
  const high = encodings.filter(e => e.severity === "high");
  let verdict;
  if (critical.length > 0 || compression.likely_encrypted) verdict = { action: "BLOCK", reason: `Critical encoding: ${critical.map(e => e.id).join(", ") || "encrypted payload"}`, risk: "critical" };
  else if (high.length > 0 || highEntropySpans.length > 2) verdict = { action: "WARN", reason: `Suspicious encoding: ${high.map(e => e.id).join(", ")}`, risk: "high" };
  else if (compression.likely_compressed || globalEntropy > 6.0) verdict = { action: "WARN", reason: "Elevated entropy — possible obfuscation", risk: "medium" };
  else verdict = { action: "PASS", reason: "Entropy normal", risk: "none" };
  return res.json({ oracle: "brackoracle/entropy-v0.1", global_entropy: +globalEntropy.toFixed(3), entropy_rating: entropyRating(globalEntropy), encodings, high_entropy_spans: highEntropySpans, compression, verdict, stats: { length: content.length, unique_chars: new Set(content).size, encoding_count: encodings.length, suspicious_spans: highEntropySpans.length } });
}

export function outputEntropy(req, res) {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  const globalEntropy = shannonEntropy(content);
  const secrets = detectSecrets(content);
  const highEntropySpans = windowedEntropy(content);
  const compression = detectCompression(content);
  const confirmedLeaks = secrets.filter(s => highEntropySpans.some(span => s.position >= span.start && s.position <= span.end));
  let verdict;
  if (confirmedLeaks.length > 0) verdict = { action: "BLOCK", reason: `${confirmedLeaks.length} confirmed secret leak(s): ${confirmedLeaks.map(s => s.id).join(", ")}`, risk: "critical" };
  else if (secrets.length > 0) verdict = { action: "WARN", reason: `${secrets.length} potential secret pattern(s) detected`, risk: "high" };
  else if (globalEntropy > 6.5) verdict = { action: "WARN", reason: "High output entropy — possible encoded data", risk: "medium" };
  else verdict = { action: "PASS", reason: "No secrets detected", risk: "none" };
  return res.json({ oracle: "brackoracle/entropy-v0.1", global_entropy: +globalEntropy.toFixed(3), entropy_rating: entropyRating(globalEntropy), secrets_detected: secrets, confirmed_leaks: confirmedLeaks, high_entropy_spans: highEntropySpans, compression, verdict, stats: { length: content.length, secret_count: secrets.length, confirmed_leak_count: confirmedLeaks.length, suspicious_spans: highEntropySpans.length } });
}
