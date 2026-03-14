import express from "express";
import { paymentMiddleware } from "x402-express";
import { malwareCheck, metabolicCheck, outputRiskCheck, promptRiskCheck, toolRiskCheck } from "./swarm.js";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import { createHash } from "crypto";

const app = express();
app.use(express.json());

const WALLET = "0xE358dc73c23bD5C221e78FFcc8f16F301bCaFB96";
const PORT = 3100;

// ─── SQLite logging ──────────────────────────────────────────────────────────
const db = new Database("/home/brack/brackoracle/oracle.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    endpoint TEXT,
    input_hash TEXT,
    verdict TEXT,
    confidence REAL,
    payment_usdc REAL,
    analysed_by TEXT,
    escalated INTEGER
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
  db.prepare(`
    INSERT INTO queries (endpoint, input_hash, verdict, confidence, payment_usdc, analysed_by, escalated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    endpoint,
    inputHash,
    result.verdict || result.risk || "unknown",
    result.confidence || 0,
    paymentUsdc,
    JSON.stringify(result.analysed_by || []),
    result.escalated ? 1 : 0
  );
  db.prepare(`
    UPDATE stats SET
      total_queries = total_queries + 1,
      total_revenue_usdc = total_revenue_usdc + ?,
      last_updated = datetime('now')
    WHERE id = 1
  `).run(paymentUsdc);
}

// ─── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Rate limit exceeded", retry_after: "60s" },
});
app.use(limiter);

// ─── x402 payment gate ───────────────────────────────────────────────────────
const FREE_TIER_CODE = 'AGENTFAST';
const freeTierCounts = new Map();

function isFreetier(req) {
  const code = req.headers['x-free-tier'];
  if (code !== FREE_TIER_CODE) return false;
  const ip = req.ip;
  const count = freeTierCounts.get(ip) || 0;
  if (count >= 200) return false;
  freeTierCounts.set(ip, count + 1);
  return true;
}

const paymentGate = paymentMiddleware(
  WALLET,
  {
    "/prompt-risk":   { price: "$0.002", network: "base" },
    "/malware-check": { price: "$0.001", network: "base" },
    "/tool-risk":     { price: "$0.003", network: "base" },
    "/output-risk":   { price: "$0.002", network: "base" },
    "/metabolic-check": { price: "$0.001", network: "base" },
  },
  { url: "https://facilitator.cdp.coinbase.com" }
);

app.use((req, res, next) => {
  if (isFreetier(req)) return next();
  return paymentGate(req, res, next);
});

// ─── Health (free) ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    service: "BrackOracle",
    version: "0.4.0",
    endpoints: [
      { path: "/prompt-risk",   price: "$0.002", description: "Prompt injection scanner" },
      { path: "/malware-check", price: "$0.001", description: "Malware hash/URL check" },
      { path: "/tool-risk",     price: "$0.003", description: "Tool safety auditor" },
    ],
    models: ["regex", "gemma3:270m"], endpoints: ["/prompt-risk", "/tool-risk", "/malware-check", "/output-risk"],
    status: "online",
  });
});

// ─── Stats (free) ─────────────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  const stats = db.prepare("SELECT * FROM stats WHERE id = 1").get();
  const topPatterns = db.prepare(`
    SELECT verdict, COUNT(*) as count 
    FROM queries 
    GROUP BY verdict 
    ORDER BY count DESC
  `).all();
  const today = db.prepare(`
    SELECT COUNT(*) as queries, SUM(payment_usdc) as revenue
    FROM queries 
    WHERE date(timestamp) = date('now')
  `).get();
  res.json({
    total_queries: stats.total_queries,
    total_revenue_usdc: stats.total_revenue_usdc,
    today: {
      queries: today.queries,
      revenue_usdc: today.revenue || 0,
    },
    verdict_breakdown: topPatterns,
    last_updated: stats.last_updated,
  });
});

// ─── Endpoints ────────────────────────────────────────────────────────────────
app.post("/prompt-risk", async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "content required" });
  try {
    const result = await promptRiskCheck(content);
    logQuery("/prompt-risk", { content }, result, 0.002);
    res.json({ ...result, oracle: "brackoracle/v0.4", endpoint: "/prompt-risk" });
  } catch (err) {
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
});

app.post("/malware-check", async (req, res) => {
  const { hash, url } = req.body;
  if (!hash && !url) return res.status(400).json({ error: "hash or url required" });
  try {
    const result = await malwareCheck(hash || url);
    logQuery("/malware-check", { hash, url }, result, 0.001);
    res.json({ ...result, oracle: "brackoracle/v0.4", endpoint: "/malware-check" });
  } catch (err) {
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
});

app.post("/tool-risk", async (req, res) => {
  const { tool_description, proposed_call } = req.body;
  if (!tool_description || !proposed_call) {
    return res.status(400).json({ error: "tool_description and proposed_call required" });
  }
  try {
    const result = await toolRiskCheck({ tool_description, proposed_call });
    logQuery("/tool-risk", { tool_description, proposed_call }, result, 0.003);
    res.json({ ...result, oracle: "brackoracle/v0.4", endpoint: "/tool-risk" });
  } catch (err) {
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
});

app.post("/output-risk", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    const result = await outputRiskCheck(content);
    logQuery("/output-risk", { content }, result, 0.002);
    res.json({ ...result, oracle: "brackoracle/v0.4", endpoint: "/output-risk" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.post("/metabolic-check", async (req, res) => {
  const { window_history, current_task } = req.body;
  if (!window_history) return res.status(400).json({ error: "window_history required" });
  try {
    const result = metabolicCheck({ window_history, current_task });
    logQuery("/metabolic-check", { window_history: window_history.length }, result, 0.001);
    res.json({ ...result, oracle: "brackoracle/v0.5", endpoint: "/metabolic-check" });
  } catch (err) {
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
});
app.listen(PORT, () => {
  console.log(`BrackOracle v0.4 running on port ${PORT}`);
  console.log(`Public: https://brack-hive.tail4f568d.ts.net`);
  console.log(`Stats:  http://localhost:${PORT}/stats`);
});
