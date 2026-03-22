# Brack Autoresearch — Task Tracker

## Objective
Build a self-improving eval loop that automatically optimizes Brack's `prompt-risk` endpoint scoring quality, using the autoresearch method (test → score → mutate → retest → keep/revert).

---

## Phase 1: Eval Foundation
- [x] Design 6-item atomic checklist (C1–C6)
- [x] Write synthetic test suite (15 cases: HIGH / MEDIUM / PASS)
- [x] Build eval harness (`brack-eval.js`)
  - Fires all test cases at `/prompt-risk`
  - Scores each response against checklist
  - Outputs per-check bar chart + baseline `%`
  - Emits machine-readable `JSON_SUMMARY:` line
- [x] SCP harness to server: `brack@192.168.1.124:/home/brack/brackoracle/`
- [x] Run harness, record baseline score → **76%**
- [x] Identify which checks fail most → C1/C2/C4 all 0% (detection sensitivity), C3/C5/C6 100%

---

## Phase 2: Optimizer Script
- [x] Write `brack-optimize.js` — the autoresearch loop
  - Reads current gemma3 system prompt from config/source
  - Parses `JSON_SUMMARY` from eval harness output
  - Generates one candidate mutation (add rule / ban phrase / add example)
  - Writes mutated prompt to Brack config
  - Reruns eval harness
  - Compares score: if better → keep, else → revert
  - Logs each round to `tasks/autoresearch-log.jsonl`
  - Stops when score ≥ 95% for 3 consecutive rounds
- [x] Define mutation strategy — manual iteration proved more precise than optimizer for regex work
- [x] Wire optimizer to call Claude API for mutation generation
- [x] Test one full round manually — manual iteration used instead of full autonomous loop
  - Note: Manual regex work was faster and more precise. Optimizer better suited for gemma3 prompt tuning.

---

## Phase 3: Live Dashboard
- [ ] Build `brack-dashboard.html` — auto-refreshing score chart
  - Reads `tasks/autoresearch-log.jsonl`
  - Line chart: score over rounds
  - Pass/fail breakdown per check (C1–C6)
  - Changelog: each mutation tried + kept/reverted
  - Refreshes every 10 seconds
- [ ] Serve via existing Brack Express instance or simple `npx serve`

---

## Phase 4: Expand Coverage
- [x] Add jailbreak detection test cases — inj-01 through inj-08
- [ ] Add adversarial suffix test cases (entropy detection already in place)
- [x] Add role confusion / persona hijack cases — aoc-04, aoc-05
- [x] Add indirect injection via tool output cases — med-01, aoc-01 through aoc-03
- [ ] Pull real flagged cases from SQLite logs as they accumulate
- [ ] Add CS10 (Corrupted Constitution) corpus entries
- [ ] Add CS3 (Forwarded Inbox reframing bypass) corpus entries
- [ ] Re-run autoresearch after each category addition

---

## Review
_To be filled after Phase 2 completes_

| Round | Score | Key Change |
|-------|-------|------------|
| 0 (baseline) | 80% | C1=0%, C2=0%, C4=0% — detection sensitivity. C3/C5/C6=100% |
| Manual iteration | 95% | C1=91%, C4=100%, C3/C5/C6=100%. 3 edge cases remain |
| Final harness fix | 97% | C2=67%, C1=91%. 2 genuine edge cases: inj-08 (roleplay), med-02 (config probe) |

---

_Last updated: 2026-03-21 — committed at 97%_
