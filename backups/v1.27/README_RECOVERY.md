# TAPHOA V1.27 — GitHub Recovery Checkpoint

Date: 2026-08-29
Branch: `backup-pre-v128-20260829`
Artifact: `TAPHOA_SUPABASE_V1_27.html`
Original bytes: 199731
Original SHA-256: `12d1cbe2dbf8f32507c8044329c52c5ab3b042b898af7c5481286931a047a983`

## Storage format

The standalone HTML is stored losslessly as:
1. gzip level 9 with deterministic `mtime=0`;
2. base64 text;
3. split into 12 ordered text parts, 6000 characters per part except the last.

This format is used only because the connected GitHub text writer accepts UTF-8 text safely. Use `restore_v1_27.py` in this folder to reconstruct the original HTML.

## Parts

- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part01` — 6000 chars — Git blob `d7c27db9b5b36508af45c45cb66fee3846836974`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part02` — 6000 chars — Git blob `1954b42fef471fdfda9b98cf9a678965cbcff30b`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part03` — 6000 chars — Git blob `7c8b4ec816aa9b98163b889b24b72ba4d3188773`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part04` — 6000 chars — Git blob `d7f0e71f5be56d0ee229dc98c0e6f2d3f22b48f6`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part05` — 6000 chars — Git blob `f5452b007cab2aae77fb1d36b323ec25836328ef`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part06` — 6000 chars — Git blob `00510b00dbfa31ceb527317ecfcc52ed2b5da82f`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part07` — 6000 chars — Git blob `1bc67f5b45fb884dc8654f028e9fe6d1fb724a68`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part08` — 6000 chars — Git blob `6998acb4b6c8f7b70c97a3e3f37df5976364e428`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part09` — 6000 chars — Git blob `80e63f3bf21b640e28e7fe5cdb1867d7a8d3a00b`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part10` — 6000 chars — Git blob `eb99f55ef8e9d93fb44af94fbe80b7b3e81b52dd`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part11` — 6000 chars — Git blob `0692b4da10d9dd33e337baca3ba24c27d999924d`
- `parts/TAPHOA_SUPABASE_V1_27.html.gz.b64.part12` — 4304 chars — Git blob `2dddfee0142b70b7071a01d75b12df13e6acc9fd`

## Verification source

`TAPHOA_V1_27_VERIFICATION.md` records the V1.27 database/UI/reconciliation verification completed before this checkpoint.

## Safety

This checkpoint is on the backup branch only. It does not update `main` and does not deploy production.
