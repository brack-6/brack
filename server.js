import express from "express";
//import { paymentMiddleware } from "x402-express";
//import { facilitator } from "@coinbase/x402";
import { agentHealthCheck, malwareCheck, metabolicCheck, outputRiskCheck, promptRiskCheck, toolRiskCheck } from "./swarm.js";
import { lineageCheck } from "./lineage.js";
import { entropyScan, outputEntropy } from "./entropy.js";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import { createHash } from "crypto";

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

const WALLET = "0x7E37015a806FF05d6ab3de50F6D0e8765d38C72D";
const PORT = 3100;

const db = new Database("/home/brack/brackoracle/oracle.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    endpoint TEXT, input_hash TEXT, verdict TEXT,
    confidence REAL, payment_usdc REAL, analysed_by TEXT, escalated INTEGER
  );
  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_queries INTEGER DEFAULT 0,
    total_revenue_usdc REAL DEFAULT 0,
    last_updated TEXT
  );
  INSERT OR IGNORE INTO stats (id, total_queries, total_revenue_usdc, last_updated)
  VALUES (1, 0, 0, datetime('now'));
`);

function logQuery(endpoint, input, result, paymentUsdc) {
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  db.prepare(`INSERT INTO queries (endpoint, input_hash, verdict, confidence, payment_usdc, analysed_by, escalated) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(endpoint, inputHash, result.verdict || result.risk || "unknown", result.confidence || 0, paymentUsdc, JSON.stringify(result.analysed_by || []), result.escalated ? 1 : 0);
  db.prepare(`UPDATE stats SET total_queries = total_queries + 1, total_revenue_usdc = total_revenue_usdc + ?, last_updated = datetime('now') WHERE id = 1`)
    .run(paymentUsdc);
}

const limiter = rateLimit({ 
  windowMs: 60000, 
  max: 100, 
  standardHeaders: true, 
  legacyHeaders: false,
  skip: (req) => req.headers["x-free-tier"] === "AGENTFAST"
});


const FREE_TIER_CODE = "AGENTFAST";
const freeTierCounts = new Map();
function isFreeTier(req) {
  const code = req.headers["x-free-tier"];
  if (code !== FREE_TIER_CODE) return false;
  const ip = req.ip;
  const count = freeTierCounts.get(ip) || 0;
  if (count >= 200) return false;
  freeTierCounts.set(ip, count + 1);
  return true;
}

/*const paymentGate = paymentMiddleware(
  WALLET,
  {
    "/prompt-risk":     { price: "$0.002", network: "base", description: "Prompt injection and jailbreak risk scanner. Detects instruction overrides, role hijacking, system prompt extraction, and indirect injection. Returns risk level, confidence score, matched patterns, and sanitized content." },
    "/malware-check":  { price: "$0.001", network: "base", description: "Malware and threat intelligence check for file hashes and URLs. Detects suspicious TLDs, typosquatting, obfuscation patterns, and known malware families. Returns verdict, confidence, and threat signals." },
    "/tool-risk":      { price: "$0.003", network: "base", description: "AI agent tool call safety auditor. Evaluates tool descriptions and proposed calls for privilege escalation, data exfiltration, destructive operations, and policy violations before execution." },
    "/output-risk":    { price: "$0.002", network: "base", description: "AI output risk scanner. Detects hallucinations, harmful content, PII leakage, and policy violations in agent-generated text before it is passed downstream or shown to users." },
    "/metabolic-check": { price: "$0.001", network: "base", description: "Agent context window metabolic analysis. Detects context bloat, memory thrash, and token inefficiency in multi-turn agent sessions. Returns health score and optimization recommendations." },
    "/agent-health":   { price: "$0.002", network: "base", description: "Comprehensive agent health check. Monitors goal alignment, action consistency, drift from original objectives, and loop detection across agent session history." },
    "/entropy-scan":   { price: "$0.001", network: "base", description: "Shannon entropy scanner for prompts. Detects base64-smuggled payloads, hex blocks, unicode escapes, invisible characters, and compressed/encrypted content. Returns entropy score, anomaly flags, and suspicious spans." },
    "/output-entropy": { price: "$0.001", network: "base", description: "Secret leakage detector for agent outputs. Hybrid regex+entropy analysis catches ETH private keys, JWTs, AWS keys, bearer tokens, and PEM headers. Cross-validates pattern matches against high-entropy spans for confirmed leaks." },
    "/lineage-check":  { price: "$0.003", network: "base", description: "Prompt lineage and contamination tracking for multi-agent pipelines. Detects whether injection patterns from one agent hop survive and propagate to downstream agents. Pass lineage_id between agents for tamper-evident chain-of-custody audit." },
  },
  facilitator
);*/

app.use((req, res, next) => {
  if (isFreeTier(req)) return next();
  return next(); // x402 disabled — re-enable when CDP auth fixed
});

app.get("/health", (req, res) => res.json({
  service: "BrackOracle", version: "0.5.0", status: "online", base_url: "https://brack-hive.tail4f568d.ts.net/oracle",
  endpoints: [
    { path: "/oracle/prompt-risk",     price: "$0.002", description: "Prompt injection scanner" },
    { path: "/oracle/malware-check",   price: "$0.001", description: "Malware/URL threat check" },
    { path: "/oracle/tool-risk",       price: "$0.003", description: "Tool call safety auditor" },
    { path: "/oracle/output-risk",     price: "$0.002", description: "Output risk scanner" },
    { path: "/oracle/metabolic-check", price: "$0.001", description: "Context window health" },
    { path: "/oracle/agent-health",    price: "$0.002", description: "Agent goal alignment check" },
    { path: "/oracle/lineage-check",   price: "$0.003", description: "Prompt contamination lineage" },
    { path: "/oracle/entropy-scan",   price: "$0.001", description: "Shannon entropy & encoding anomaly scanner" },
    { path: "/oracle/output-entropy", price: "$0.001", description: "Secret leakage detector for agent outputs" },
  ],
}));

app.get("/stats", (req, res) => {
  const stats = db.prepare("SELECT * FROM stats WHERE id = 1").get();
  const topPatterns = db.prepare("SELECT verdict, COUNT(*) as count FROM queries GROUP BY verdict ORDER BY count DESC").all();
  const today = db.prepare("SELECT COUNT(*) as queries, SUM(payment_usdc) as revenue FROM queries WHERE date(timestamp) = date('now')").get();
  res.json({ total_queries: stats.total_queries, total_revenue_usdc: stats.total_revenue_usdc, today: { queries: today.queries, revenue_usdc: today.revenue || 0 }, verdict_breakdown: topPatterns });
});

app.post("/prompt-risk", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  try { const result = await promptRiskCheck(content); logQuery("/prompt-risk", { content }, result, 0.002); res.json({ ...result, oracle: "brackoracle/v0.5" }); }
  catch (err) { res.status(500).json({ error: "Analysis failed", detail: err.message }); }
});

app.post("/malware-check", async (req, res) => {
  const { hash, url } = req.body;
  if (!hash && !url) return res.status(400).json({ error: "hash or url required" });
  try { const result = await malwareCheck(hash || url); logQuery("/malware-check", { hash, url }, result, 0.001); res.json({ ...result, oracle: "brackoracle/v0.5" }); }
  catch (err) { res.status(500).json({ error: "Analysis failed", detail: err.message }); }
});

app.post("/tool-risk", async (req, res) => {
  const { tool_description, proposed_call } = req.body;
  if (!tool_description || !proposed_call) return res.status(400).json({ error: "tool_description and proposed_call required" });
  try { const result = await toolRiskCheck({ tool_description, proposed_call }); logQuery("/tool-risk", { tool_description, proposed_call }, result, 0.003); res.json({ ...result, oracle: "brackoracle/v0.5" }); }
  catch (err) { res.status(500).json({ error: "Analysis failed", detail: err.message }); }
});

app.post("/output-risk", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  try { const result = await outputRiskCheck(content); logQuery("/output-risk", { content }, result, 0.002); res.json({ ...result, oracle: "brackoracle/v0.5" }); }
  catch (err) { res.status(500).json({ error: "Analysis failed", detail: err.message }); }
});

app.post("/metabolic-check", async (req, res) => {
  const { window_history, current_task } = req.body;
  if (!window_history) return res.status(400).json({ error: "window_history required" });
  try { const result = metabolicCheck({ window_history, current_task }); logQuery("/metabolic-check", { window_history: window_history.length }, result, 0.001); res.json({ ...result, oracle: "brackoracle/v0.5" }); }
  catch (err) { res.status(500).json({ error: "Analysis failed", detail: err.message }); }
});

app.post("/agent-health", async (req, res) => {
  const { window_history, original_goal, current_task, action_log } = req.body;
  if (!window_history) return res.status(400).json({ error: "window_history required" });
  try { const result = agentHealthCheck({ window_history, original_goal, current_task, action_log }); logQuery("/agent-health", { window_history: window_history.length }, result, 0.002); res.json({ ...result, oracle: "brackoracle/v0.5" }); }
  catch (err) { res.status(500).json({ error: "Analysis failed", detail: err.message }); }
});

app.post("/entropy-scan",   (req, res) => entropyScan(req, res));
app.post("/output-entropy", (req, res) => outputEntropy(req, res));
app.post("/lineage-check",  (req, res) => lineageCheck(req, res));

app.listen(PORT, () => {
  console.log(`BrackOracle v0.5 running on port ${PORT}`);
  console.log(`Public: https://brack-hive.tail4f568d.ts.net`);
});
