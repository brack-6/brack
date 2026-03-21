# Brack Autoresearch — Lessons Log

Running record of patterns, mistakes, and rules learned during the build.
Review this at the start of each session before touching code.

---

## Design Lessons

### L001 — Checklist size matters
**Pattern:** More than 6 checklist items causes the optimizer to overfit — the model starts gaming specific checks rather than improving general quality.
**Rule:** Keep the checklist at 3–6 atomic yes/no questions. Each must be independently verifiable without reading the others.

### L002 — Vague scoring criteria poison the loop
**Pattern:** A check like "is the output good?" gives inconsistent scores across runs, making it impossible to tell if a mutation helped.
**Rule:** Every check must have a binary pass/fail that any script (not just an LLM) could evaluate given the right data. If you can't write the check as code, rewrite the criterion.

### L003 — C6 (specific reason field) is the canary
**Pattern:** When the gemma3 prompt is weak, `reason` fields collapse to single words like "suspicious" or "risky". This is the first symptom of a degraded prompt.
**Rule:** Always check C6 first when diagnosing a score drop. A vague reason field means the model lost the plot on what it's detecting.

### L004 — Benign cases are as important as attack cases
**Pattern:** Early eval designs focused only on attack detection. Without benign cases, the optimizer can reach 100% by flagging everything HIGH.
**Rule:** Maintain a minimum 30% benign cases in the test suite. False positive rate is a first-class metric, not an afterthought.

### L005 — One mutation per round, not many
**Pattern:** Changing multiple things at once makes it impossible to know which change caused a score improvement or regression.
**Rule:** The optimizer must make exactly one change per round. If a round produces a complex diff, it's a bug in the optimizer, not a feature.

---

## Implementation Lessons

_Add entries here after any correction or unexpected behavior during build._

**Format:**
```
### LXXX — Short title
**Pattern:** What went wrong or was learned.
**Rule:** The rule that prevents recurrence.
```

---

## Session Notes

### 2026-03-20 — Session 1
- Designed checklist C1–C6
- Built 15-case synthetic test suite (8 HIGH, 2 MEDIUM, 5 PASS)
- Completed `brack-eval.js` eval harness
- Established `tasks/` structure using plan-first method
- **Next:** SCP harness to server, run baseline, begin optimizer design

### L006 — Single pattern match = MEDIUM is correct, not a bug
**Pattern:** The eval harness was expecting HIGH for social engineering cases that only trigger one regex pattern. Brack's design is: 1 pattern = medium/review, 2+ patterns = high/block. Penalizing medium results on single-vector attacks was scoring correct behavior as failure.
**Rule:** Set expected value based on how many patterns the attack realistically triggers. Single-vector social engineering = MEDIUM. Multi-vector attacks (identity claim + SOUL.md overwrite + account compromise) = HIGH.

### L007 — systemd vs pm2 conflict causes silent restart failures
**Pattern:** brackoracle was registered under both systemd and pm2. `sudo systemctl restart brackoracle` appeared to succeed but pm2 still held port 3100, so the old process kept serving. New code never loaded.
**Rule:** Always use `pm2 restart brackoracle` as the canonical restart. systemd is disabled. Verify with `ps aux | grep "node server" | grep -v grep` — should show exactly one process.

### L008 — Regex word-sequence gaps cause silent misses
**Pattern:** Pattern `/send me (?:all|your|the)?(?:recent)? emails/` fails on "send me all your recent emails" because it can't match `all your recent` as a three-word optional sequence.
**Rule:** For natural language patterns with variable filler words between anchor terms, use `[^.?!]{0,N}` to allow N characters of flexible content rather than chaining optional groups.

### L009 — Module import test is the ground truth for regex loading
**Pattern:** Multiple attempts to verify regex via curl failed because systemd was serving old code. Direct module import bypasses the server entirely.
**Rule:** When a pattern is confirmed in the file but not firing via API, always test with `node --input-type=module << 'EOF'
import { promptRiskCheck } from '/home/brack/brackoracle/swarm.js';
EOF` before assuming a server/restart issue.

---

## Session Notes

### 2026-03-21 — Session 2
- Resolved systemd/pm2 dual-process conflict — pm2 is canonical
- Deployed AgentsOfChaos CS2+CS8 corpus (Northeastern/Harvard/MIT/Stanford/CMU paper, Feb 2026)
- Fixed email dump regex (word-sequence gap)
- Confirmed aoc-04/05 (CS8) → HIGH correctly
- Reclassified aoc-01/02/03 (CS2) → MEDIUM (single pattern = correct behavior)
- Baseline: 80%, 20 cases, 0 errors
- Real failure targets: inj-03/04/06/07/08/med-01 returning LOW — gemma3 not catching them
- **Next:** Run optimizer targeting the LOW failures, or add regex for inj cases slipping through
