# PRODUCT DATA RULES — SUPABASE ONLY

> **LOCKED 2026-10-06**
>
> Canonical owner for TAPHOA products, prices, sources, orders and debt is Supabase `1sl2tpvn` only.

## Runtime rule

```text
Admin / Web
→ Supabase canonical tables + RPC
→ revision/realtime signal
→ Browser refreshes from Supabase
```

Google Drive / Google Sheets / XLS/XLSX files are **manual reference or import material only**. They are not live product sources and must never automatically overwrite Supabase.

## Forbidden

- No Google Drive push watch for TAPHOA product/catalog data.
- No `taphoa-sheet-watch-renew`.
- No cron/polling/modifiedTime wake for product sync.
- No Sheet → Supabase automatic import.
- No Supabase → Sheet automatic write-back.
- No background one-way or two-way Sheet sync.
- No product outbox / sheet-state / sync-lock runtime.
- No automatic product-code allocation inside Google Sheet.
- No UI merge between Supabase and Sheet.
- No XLS/XLSX file may be treated as authoritative after an admin edit in Supabase.

## Allowed

- Read an uploaded XLS/XLSX or Sheet manually to compare/audit when the user explicitly asks.
- Export a read-only report/snapshot from Supabase when the user explicitly asks.
- Manual, explicit import may be performed only after showing/validating the intended diff; it is a one-time command, not a persistent sync path.

## Production gate

Production is valid only when all are true:

- Supabase is the only product/catalog writer.
- TAPHOA Sheet/Drive cron count = 0.
- Active Drive watch count = 0.
- Google sync secret does not exist.
- Google sync state/outbox tables and mutating RPCs do not exist.
- `taphoa-sheet-sync` is an inert HTTP 410 tombstone with no DB/network work.
- Product admin writes directly to Supabase.
- Browser reads products from Supabase revision/bootstrap only.

Historical migrations/docs may describe retired Sheet designs for audit history, but they are not current operating rules and must never be re-enabled.
