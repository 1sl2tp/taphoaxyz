-- SPEC-BANK-ZONE-OCR-OPTIONAL-NAME-20261116
-- Source-only migration: deploy through the canonical approved release process.
-- Given a verified bank credit and a bill with an absent or accented recipient name,
-- the SQL collector must not reject a missing name; visible names compare accent-insensitively.
-- Must stay: destination account, amount, bank transaction clock, anti-duplicate locking,
-- ledger idempotency, evidence checks, notification permissions and balances.
-- No automatic backfill, payment posts or production writes from this source commit.
-- Rollback: restore the preceding definition of public.chat_bank_app_collect(uuid,bigint).
DO $bank_optional_name$
DECLARE
  v_sql text;
  v_original text := $original$upper(regexp_replace(btrim(r.receiving_name),'[[:space:]]+',' ','g'))$original$;
  v_replacement text := $replacement$upper(regexp_replace(extensions.unaccent(btrim(r.receiving_name)),'[[:space:]]+',' ','g'))$replacement$;
BEGIN
  SELECT pg_get_functiondef('public.chat_bank_app_collect(uuid,bigint)'::regprocedure)
    INTO v_sql;
  IF v_sql IS NULL OR strpos(v_sql, v_original) = 0 THEN
    RAISE EXCEPTION 'BANK-ZONE-OPTIONAL-NAME: live bank collector differs; stop instead of replacing unrelated logic';
  END IF;
  -- Change only the existing present-name comparison. Missing/null names
  -- continue to bypass this optional field as before.
  EXECUTE replace(v_sql, v_original, v_replacement);
END
$bank_optional_name$;