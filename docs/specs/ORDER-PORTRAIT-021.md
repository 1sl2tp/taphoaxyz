# ORDER-PORTRAIT-021 — Modern horizontal receipt header

## Trigger and design goal
The user requested a modern receipt header after reviewing DG365/DG366 in Chat: customer name on the **left**, order ID and full time on the **right**, with a tasteful colored background. The previous UI-PORTRAIT-020 header stacked order code/time first and customer next, using extra visual space and giving the customer's name too little emphasis.

## Layout contract
- Single canonical renderer `src/fixed-ui-portrait-order.js` serves both DOM screenshot/capture and offline Canvas PNG sent to Chat/Zalo. No duplicate header implementation outside this file.
- Fixed 440 logical-pixel document; interior 396px. Left track 228px, 14px gap, right meta card 154px. Name left at 22px bold, tiny label `KHÁCH HÀNG`; right white metadata card uses `MÃ ĐƠN` / `ĐƠN TẠM` label, prominent 18px order ID, exact clock and date in 12px lines. When input provides date before time or vice versa, normalize presentation to clock/date without losing seconds.
- Delivered header: pale blue (#eaf3fc) plus slim blue accent, white metadata card; draft header: warm ivory (#fff5e9), separate label and accent. Never use vivid full-frame fill that impairs Chat legibility. Colors mean only receipt state, not finances.
- Ordinary name/code/time fit one horizontal row of two *zones*, **not** three full-width header rows. If a name or order ID is genuinely long, wrap inside its own zone and increase header height instead of clipping or overflowing into the adjacent zone. Multi-page receipts retain page marker.
- Keep the same 5-column numeric grid, money without rounding, order ID/data/status/permissions unchanged. Never resend previous images simply to adopt the new design. Images previously sent are immutable.

## Validation
- E0: screenshot and existing code review.
- E1: Node contract tests assert text position, right alignment, date/time parsing, name/code wrapping, pale background, HTML/Canvas equivalence, encoding, draft palette; full repository regression must pass.
- E2: frontend only; no Supabase migration, database or messaging changes.
- E3: only mark GitHub CI / Pages published after confirmed workflows.
- E4: physical iPhone/Android and Chat display width QA remains separate pending evidence.
- E5: no new API, fonts, network, timers, background jobs or production messages.
- Versioning: index script query `portrait-head=20261115-021`; SW cache v44 to invalidate Web/PWA copies.
- Rollback: revert this source-only change; preserve historical media.
