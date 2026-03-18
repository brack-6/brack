import Database from "better-sqlite3";
import { createHash, createHmac } from "crypto";

const db = new Database("/home/brack/brackoracle/lineage.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS lineage_chains (
    chain_id     TEXT PRIMARY KEY,
    created_at   INTEGER,
    hop_count    INTEGER DEFAULT 0,
    contaminated INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS lineage_hops (
    hop_id       TEXT PRIMARY KEY,
    chain_id     TEXT,
    hop_index    INTEGER,
    timestamp    INTEGER,
    prompt_hash  TEXT,
    prompt_len   INTEGER,
    threats      TEXT,
    clean        INTEGER,
    sig          TEXT
  );
`);

const INJECTION_PATTERNS = [
  { id: "pi_override",   pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,        severity: "critical" },
  { id: "pi_system",    pattern: /\[\s*system\s*\]/i,                                                  severity: "high"     },
  { id: "pi_jailbreak", pattern: /you\s+are\s+now\s+(a\s+)?(dan|jailbreak|unrestricted)/i,            severity: "critical" },
  { id: "pi_exfil",     pattern: /(repeat|print|output|reveal|show)\s+(your\s+)?(system\s+)?prompt/i, severity: "high"     },
  { id: "pi_role",      pattern: /pretend\s+(you\s+are|to\s+be)|act\s+as\s+if\s+you\s+have\s+no/i,   severity: "high"     },
  { id: "pi_escape",    pattern: /```[\s\S]{0,20}(ignore|override|system)/i,                           severity: "medium"   },
  { id: "pi_indirect",  pattern: /\{\{.*?(inject|override|prompt).*?\}\}/i,                            severity: "medium"   },
  { id: "pi_unicode",   pattern: /[\u202e\u200b\u200c\u200d\ufeff]/,                                  severity: "medium"   },
  { id: "pi_delimiter", pattern: /(---+|===+|\*\*\*+)\s*(new\s+)?(instruction|task|prompt)/i,         severity: "medium"   },
  { id: "pi_url_embed", pattern: /https?:\/\/[^\s]*\?(.*?inject|.*?prompt|.*?cmd)/i,                  severity: "high"     },
];

function analyzePrompt(content) {
  const threats = [];
  for (const { id, pattern, severity } of INJECTION_PATTERNS) {
    const match = pattern.exec(content);
    if (match) threats.push({ id, severity, match: match[0].slice(0, 60), position: match.index });
  }
  return {
    hash: createHash("sha256").update(content).digest("hex"),
    length: content.length,
    threats,
    clean: threats.length === 0,
    severity: threats.reduce((worst, t) => {
      const rank = { critical: 3, high: 2, medium: 1, low: 0, none: -1 };
      return rank[t.severity] > rank[worst] ? t.severity : worst;
    }, "none"),
  };
}

const CHAIN_SECRET = process.env.LINEAGE_SECRET || "brack-lineage-v1";
function signHop(chainId, hopIndex, promptHash) {
  return createHmac("sha256", CHAIN_SECRET).update(`${chainId}:${hopIndex}:${promptHash}`).digest("hex").slice(0, 16);
}
function makeLineageId(chainId, hopIndex, sig) {
  return Buffer.from(`${chainId}:${hopIndex}:${sig}`).toString("base64url");
}
function parseLineageId(lineageId) {
  try {
    const decoded = Buffer.from(lineageId, "base64url").toString();
    const [chainId, hopIndex, sig] = decoded.split(":");
    return { chainId, hopIndex: parseInt(hopIndex), sig };
  } catch { return null; }
}

function deriveVerdict(analysis, priorContaminated, survivedThreats) {
  if (survivedThreats.length > 0) return { action: "BLOCK", reason: `Injection propagated across ${survivedThreats.length} hop(s): ${survivedThreats.map(t => t.id).join(", ")}`, risk: "critical" };
  if (!analysis.clean && analysis.severity === "critical") return { action: "BLOCK", reason: "Critical injection at this hop", risk: "critical" };
  if (!analysis.clean) return { action: "WARN", reason: `${analysis.threats.length} threat(s) detected`, risk: analysis.severity };
  if (priorContaminated) return { action: "WARN", reason: "Prior hop was contaminated", risk: "medium" };
  return { action: "PASS", reason: "Chain clean", risk: "none" };
}

export function lineageCheck(req, res) {
  const { content, lineage_id = null, agent_id = "unknown" } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });

  const analysis = analyzePrompt(content);
  const now = Date.now();
  let chainId, hopIndex, priorContaminated = false;

  if (!lineage_id) {
    chainId = createHash("sha256").update(`${now}:${analysis.hash}:${agent_id}`).digest("hex").slice(0, 16);
    hopIndex = 0;
    db.prepare(`INSERT INTO lineage_chains (chain_id, created_at, hop_count, contaminated) VALUES (?, ?, 1, ?)`)
      .run(chainId, now, analysis.clean ? 0 : 1);
  } else {
    const parsed = parseLineageId(lineage_id);
    if (!parsed) return res.status(400).json({ error: "invalid lineage_id" });
    const chain = db.prepare("SELECT * FROM lineage_chains WHERE chain_id = ?").get(parsed.chainId);
    if (!chain) return res.status(400).json({ error: "unknown chain" });
    chainId = parsed.chainId;
    hopIndex = chain.hop_count;
    priorContaminated = chain.contaminated === 1;
    db.prepare(`UPDATE lineage_chains SET hop_count = hop_count + 1, contaminated = contaminated | ? WHERE chain_id = ?`)
      .run(analysis.clean ? 0 : 1, chainId);
  }

  const sig = signHop(chainId, hopIndex, analysis.hash);
  db.prepare(`INSERT INTO lineage_hops (hop_id, chain_id, hop_index, timestamp, prompt_hash, prompt_len, threats, clean, sig) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(`${chainId}-${hopIndex}`, chainId, hopIndex, now, analysis.hash, analysis.length, JSON.stringify(analysis.threats), analysis.clean ? 1 : 0, sig);

  const hops = db.prepare("SELECT * FROM lineage_hops WHERE chain_id = ? ORDER BY hop_index").all(chainId)
    .map(h => ({ hop: h.hop_index, timestamp: h.timestamp, prompt_hash: h.prompt_hash, clean: h.clean === 1, threats: JSON.parse(h.threats) }));

  const priorThreatIds = new Set(hops.slice(0, -1).flatMap(h => h.threats.map(t => t.id)));
  const survivedThreats = analysis.threats.filter(t => priorThreatIds.has(t.id));
  const newLineageId = makeLineageId(chainId, hopIndex, sig);

  return res.json({
    oracle: "brackoracle/lineage-v0.1",
    chain_id: chainId,
    lineage_id: newLineageId,
    hop: hopIndex,
    this_hop: { clean: analysis.clean, severity: analysis.severity, threats: analysis.threats, prompt_hash: analysis.hash },
    chain_status: { total_hops: hops.length, contaminated_hops: hops.filter(h => !h.clean).length, chain_clean: hops.every(h => h.clean), contamination_survived: survivedThreats.length > 0, survived_threats: survivedThreats, prior_contaminated: priorContaminated },
    hops,
    verdict: deriveVerdict(analysis, priorContaminated, survivedThreats),
  });
}
