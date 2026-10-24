-- CYCLE-196: once each morning at 08:00 Vietnam time (01:00 UTC).
-- No immediate send on migration; notice delivery is idempotent and opt-in gated.
SELECT cron.schedule('taphoa-cycle-policy-due-notice-v1',
  '0 1 * * *',
  'select v21_private.taphoa_cycle_send_due_notices();');