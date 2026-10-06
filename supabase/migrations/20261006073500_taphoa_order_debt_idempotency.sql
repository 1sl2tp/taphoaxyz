-- Defense in depth for order/debt idempotency.
-- The RPCs already row-lock and gate status transitions; this partial unique
-- index makes duplicate order-linked sale/reversal debt rows impossible even
-- if a future caller regresses.

create unique index if not exists taphoa_debt_ledger_order_entry_unique
on public.taphoa_debt_ledger (order_id,entry_type)
where order_id is not null
  and entry_type in ('sale','reversal');
