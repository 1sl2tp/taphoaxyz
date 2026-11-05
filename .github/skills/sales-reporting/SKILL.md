---
name: sales-reporting
description: Verify sales reporting contracts and regressions in this repository.
---

# Sales reporting

## Discover before changing
Read repository README, AGENTS.md if present, CURRENT_WORK.md and README_MAINTENANCE.md if present, and resource/deploy guardrails. Identify actual source owner and tests. Candidate discovery: README.md, source modules and Supabase RPC contracts discovered from source. Do not treat candidate files as verified owners until inspected.

## Required audit
date-range boundaries, unique buyers, revenue, cost, profit, refunds, numeric formatting. Capture reproducible symptoms and distinguish source, generated artifacts, API, client state and production behavior. Check edge cases and cross-feature consistency; do not mutate production data or send real messages.

## Repair gate
One incident, one owner, minimal patch and regression test. Run supported build/CI and confirm production/device separately; record E0 evidence, E1 patch/test, E2 CI, E3 deploy, E4 real behavior, E5 acceptance. Unknown stages remain PENDING. No speculative dependency, polling, cache or deployment changes.
