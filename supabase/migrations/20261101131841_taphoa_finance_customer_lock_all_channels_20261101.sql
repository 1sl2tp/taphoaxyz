-- SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101
-- Given concurrent Web/PWA, Chat, and Agribank money writes for one customer,
-- lock the customer before duplicate checks and receipt opening/closing balances.
-- MUST-STAY: bank global lock, bank proof checks, finance auth, positive amounts,
-- idempotency and existing notification consent. No historical ledger edits.
-- Rollback: restore the preceding definitions of these three functions.

CREATE OR REPLACE FUNCTION public.chat_admin_quick_cash_collect(p_app_session_id uuid, p_customer_id uuid, p_amount_vnd bigint, p_note text, p_command_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'auth', 'pg_temp'
AS $$
DECLARE
 v_admin uuid;
 v_prior jsonb;
 v_amount numeric;
 v_before numeric;
 v_after numeric;
 v_ledger bigint;
 v_body text;
 v_url text;
 v_message uuid;
 v_result jsonb;
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (
  SELECT 1 FROM public.v21_accounts a WHERE a.id=v_admin
  AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ) THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL THEN RAISE EXCEPTION 'command_id_required'; END IF;
 IF p_amount_vnd IS NULL OR p_amount_vnd<1000 OR p_amount_vnd>999999999000
  OR mod(p_amount_vnd,1000)<>0
 THEN RAISE EXCEPTION 'invalid_amount_thousands'; END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 240
 THEN RAISE EXCEPTION 'collection_note_required'; END IF;
 IF p_customer_id IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.v21_accounts a WHERE a.id=p_customer_id
  AND a.role='user' AND a.contact_group='customer'
  AND a.deleted_at IS NULL AND a.locked_at IS NULL
 ) THEN RAISE EXCEPTION 'customer_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
 SELECT c.result INTO v_prior FROM public.taphoa_command_log c
  WHERE c.command_id=p_command_id;
 IF FOUND THEN
  IF v_prior->>'customer_id' IS DISTINCT FROM p_customer_id::text
    OR v_prior->>'receipt_kind' IS DISTINCT FROM 'collection'
    OR (v_prior->>'source_amount_vnd')::bigint IS DISTINCT FROM p_amount_vnd
  THEN RAISE EXCEPTION 'command_id_conflict'; END IF;
  RETURN v_prior || jsonb_build_object('replayed',true);
 END IF;
 v_amount:=p_amount_vnd::numeric/1000;
 -- SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101:
 -- Serialize manual Chat and Web/PWA receipt snapshots per customer.
 PERFORM pg_advisory_xact_lock(hashtextextended('taphoa-money:' || p_customer_id::text,0));
 v_before:=public.taphoa_chat_customer_balance_value(p_customer_id);
 INSERT INTO public.taphoa_debt_ledger(
  customer_account_id,entry_type,amount_vnd,note,created_by_account_id
 ) VALUES (
  p_customer_id,'collection',-v_amount,btrim(p_note),v_admin
 ) RETURNING id INTO v_ledger;
 PERFORM public.taphoa_bump_revision('debt');
 v_after:=public.taphoa_chat_customer_balance_value(p_customer_id);
 v_body:='✅ Đã thu · '||public.taphoa_chat_money(v_amount)
  ||E'\n'||public.taphoa_chat_balance_label(v_before,true)
  ||E'\n'||public.taphoa_chat_balance_label(v_after,false)
  ||E'\nGhi chú: '||btrim(p_note);
 v_url:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
 IF coalesce(v_url,'')<>'' THEN v_body:=v_body||E'\nXem công nợ: '||v_url; END IF;
 v_message:=public.taphoa_chat_notify_customer(
  p_customer_id,v_admin,'taphoa:'||p_command_id::text||':collection',v_body
 );
 v_result:=jsonb_build_object(
  'ok',true,'customer_id',p_customer_id::text,'receipt_kind','collection',
  'source','manual_cash','amount_vnd',v_amount,'source_amount_vnd',p_amount_vnd,
  'movement',-v_amount,'ledger_id',v_ledger,'receipt_note',btrim(p_note),
  'balance_before_vnd',v_before,'balance_after_vnd',v_after,
  'receipt_at',clock_timestamp(),'notice_sent',v_message IS NOT NULL
 );
 INSERT INTO public.taphoa_command_log(command_id,operation,result)
 VALUES(p_command_id,'debt_transaction',v_result);
 RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_bank_app_collect(p_asset_id uuid, p_notification_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $$
declare
  r public.chat_bank_bill_receipts%rowtype;
  n public.taphoa_agribank_notifications%rowtype;
  config public.chat_auto_collect_settings%rowtype;
  match_amount text[];
  match_date text[];
  account_number text;
  transfer_amount bigint;
  transaction_at timestamptz;
  image_at timestamptz;
  customer uuid;
  admin uuid;
  ledger bigint;
  before_balance numeric;
  after_balance numeric;
  thousands numeric;
  notice text;
  link text;
  message_id uuid;
  result jsonb;
  prior jsonb;
begin
  if p_asset_id is null or p_notification_id is null then
    return jsonb_build_object('ok',false,'status','missing_evidence');
  end if;
  -- Serializes all auto-captures against themselves and test pilot.
  perform pg_advisory_xact_lock(17812026);
  select * into config from public.chat_auto_collect_settings where singleton=true for update;
  if not found or not(config.enabled and config.ready) then
    return jsonb_build_object('ok',false,'status','disabled_or_not_ready');
  end if;

  select * into r from public.chat_bank_bill_receipts
  where media_asset_id=p_asset_id for update;
  if not found then return jsonb_build_object('ok',false,'status','bill_not_found'); end if;
  if r.status='received' and r.ledger_id is not null then
    select c.result into prior
      from public.chat_bank_app_collection_links l
      join public.taphoa_command_log c on c.command_id=l.receipt_id
      where l.receipt_id=r.id and l.notification_id=p_notification_id;
    if prior is not null then
      return jsonb_build_object('ok',true,'status','received','replayed',true,'ledger_id',r.ledger_id);
    end if;
    return jsonb_build_object('ok',false,'status','bill_already_used');
  end if;

  if r.status <> 'amount_read' or r.ledger_id is not null
     or r.amount_vnd is null or r.amount_vnd<=0 or r.amount_vnd>=1000000000000
     or mod(r.amount_vnd,1000)<>0
     or r.image_sha256 is null or r.model_name is null or r.scanned_at is null
     or r.raw_read->>'rule_version'<>'bank_bill_amount_v4_20261018'
     or r.raw_read->>'transfer_success_visible'<>'true'
     or r.raw_read->>'amount_clear'<>'true'
     or r.raw_read->>'transaction_selection' not in ('single_detail','latest_top_row')
     or r.raw_read->>'transaction_nature' not in ('transfer','incoming_transfer')
     or r.raw_read#>>'{match_preview,status}'<>'candidate_unique'
     or r.raw_read#>>'{match_preview,source}'<>'agribank_plus_notification'
     or r.raw_read#>>'{match_preview,notification_id}' is distinct from p_notification_id::text
     
     or r.transfer_at_vn is null
  then return jsonb_build_object('ok',false,'status','bill_not_verified'); end if;
  select * into n from public.taphoa_agribank_notifications where id=p_notification_id for update;
  if not found or n.status<>'credit_candidate' or n.package_name<>'com.vnpay.Agribank3g'
    or n.amount_vnd is null or n.amount_vnd<=0 or n.is_own_transfer=true or n.transfer_at is null
    or not exists(select 1 from public.taphoa_sms_ingest_devices d
        where d.id=n.device_id and d.active=true)
  then return jsonb_build_object('ok',false,'status','notification_not_verified'); end if;
  if upper(n.body) ~ '(OTP|SOFTOTP|MA XAC THUC|MAT KHAU|PASSWORD|MA PIN|TIEN LAI|TRA LAI|HOAN PHI)'
  then return jsonb_build_object('ok',false,'status','notification_rejected'); end if;

  -- Parse one explicitly POSITIVE account credit; never parse account balance.
  match_amount:=regexp_match(n.body,
    '([0-9]{9,20})[[:space:]]*:[[:space:]]*\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*(VND|VNĐ|Đ)','i');
  if match_amount is null or match_amount[2] !~ '(^[0-9]{1,12}$|^[0-9]{1,3}([.,][0-9]{3})+$)' then
    return jsonb_build_object('ok',false,'status','unreadable_credit');
  end if;
  account_number:=match_amount[1];
  transfer_amount:=replace(replace(match_amount[2],'.',''),',','')::bigint;
  if account_number<>'2901181999999' or transfer_amount<>r.amount_vnd
    or transfer_amount<>n.amount_vnd or mod(transfer_amount,1000)<>0
  then return jsonb_build_object('ok',false,'status','credit_mismatch'); end if;
  -- BANK-212: one-minute transaction time tolerance.
  -- Validate actual bank timestamp printed inside the Agribank notification.
  match_date:=regexp_match(n.body,
    '([0-2][0-9]):([0-5][0-9])[[:space:]]+([0-3][0-9])/([0-1][0-9])/([0-9]{4})');
  if match_date is null then return jsonb_build_object('ok',false,'status','bank_time_unreadable'); end if;
  begin
    transaction_at:=make_timestamp(match_date[5]::int,match_date[4]::int,
      match_date[3]::int,match_date[1]::int,match_date[2]::int,0) at time zone 'Asia/Ho_Chi_Minh';
  exception when datetime_field_overflow then
    return jsonb_build_object('ok',false,'status','bank_time_invalid');
  end;
  image_at:=r.transfer_at_vn at time zone 'Asia/Ho_Chi_Minh';
   -- BANK-174: only current Vietnam business day may be auto-collected.
   -- Late push or yesterday's bill stays in review, never backfills a closed day.
   if r.transfer_at_vn::date <> (r.sent_at at time zone 'Asia/Ho_Chi_Minh')::date
      or r.transfer_at_vn::date <> (now() at time zone 'Asia/Ho_Chi_Minh')::date
      or (n.transfer_at at time zone 'Asia/Ho_Chi_Minh')::date <> r.transfer_at_vn::date
   then return jsonb_build_object('ok',false,'status','bill_outside_current_business_day'); end if;
  if abs(extract(epoch from(image_at-transaction_at)))>60
     or transaction_at>now()+interval '2 minutes'
  then return jsonb_build_object('ok',false,'status','time_mismatch'); end if;

  -- Tier 1: bank credit amount + printed transaction time + one unique valid bill.
  -- Tier 2: recipient name if readable; Tier 3: destination account and bank if readable.
  -- Missing optional text is NOT a blocker; clearly conflicting text remains review-only.
  if nullif(btrim(coalesce(r.receiving_name,'')),'') is not null
      and upper(regexp_replace(btrim(r.receiving_name),'[[:space:]]+',' ','g'))<>'BUI XUAN TUNG'
  then return jsonb_build_object('ok',false,'status','recipient_name_conflict'); end if;
  if nullif(btrim(coalesce(r.receiving_bank,'')),'') is not null
      and upper(btrim(r.receiving_bank))<>'AGRIBANK'
  then return jsonb_build_object('ok',false,'status','recipient_bank_conflict'); end if;
  if nullif(btrim(coalesce(r.raw_read->>'recipient_account_last5','')),'') is not null
      and r.raw_read->>'recipient_account_last5'<>right(account_number,5)
  then return jsonb_build_object('ok',false,'status','recipient_account_conflict'); end if;
  -- A customer receipt may show only *****99999 or a partly misread full account.
  -- Last five digits are optional supporting evidence; full account comes from Agribank.
  if nullif(btrim(coalesce(r.receiving_account,'')),'') is not null
    and length(regexp_replace(r.receiving_account,'[^0-9]','','g'))>=5
    and right(regexp_replace(r.receiving_account,'[^0-9]','','g'),5)<>right(account_number,5)
  then return jsonb_build_object('ok',false,'status','recipient_account_conflict'); end if;

  if exists(select 1 from public.chat_bank_manual_collections m where m.notification_id=n.id)
    then return jsonb_build_object('ok',false,'status','already_manual_collected'); end if;

    if exists(select 1 from public.chat_bank_app_collection_links l
       where l.notification_id=n.id or l.receipt_id=r.id)
    -- BANK-214: same-amount transactions are not automatically duplicates.
    -- Require the same strong bank reference/date/origin, an identical image,
    -- or a competing claim on the SAME one-minute bank proof.
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and (
         (o.image_sha256 is not null and o.image_sha256=r.image_sha256)
         or (o.amount_vnd=r.amount_vnd and o.status in ('amount_read','review','received','historical_reference')
           and (
             o.transfer_at_vn between r.transfer_at_vn-interval '60 seconds'
               and r.transfer_at_vn+interval '60 seconds'
             or (
               nullif(btrim(o.transfer_reference),'') is not null
               and nullif(btrim(r.transfer_reference),'') is not null
               and upper(btrim(o.transfer_reference))=upper(btrim(r.transfer_reference))
               and o.transfer_at_vn::date=r.transfer_at_vn::date
               and (
                 nullif(btrim(o.sending_bank),'') is null
                 or nullif(btrim(r.sending_bank),'') is null
                 or upper(btrim(o.sending_bank))=upper(btrim(r.sending_bank))
               )
             )
           ))
       ))
    or exists(select 1 from public.taphoa_agribank_notifications o
       where o.id<>n.id and o.status='credit_candidate' and o.amount_vnd=n.amount_vnd
         and o.transfer_at between n.transfer_at-interval '60 seconds' and n.transfer_at+interval '60 seconds')
    or exists(select 1 from public.chat_bank_bill_receipts o
       where o.id<>r.id and o.customer_account_id=r.customer_account_id
         and o.status in ('queued','scanning')
         and o.sent_at between r.sent_at-interval '3 minutes' and r.sent_at+interval '3 minutes')
  then return jsonb_build_object('ok',false,'status','duplicate_or_ambiguous'); end if;

  select m.sender_account_id into customer
  from public.v21_messages m
  join public.v21_media_assets a on a.message_id=m.id
  join public.v21_accounts c on c.id=m.sender_account_id
  where m.id=r.message_id and m.deleted_at is null
    and a.id=r.media_asset_id and a.deleted_at is null and a.kind='image'
    and a.owner_account_id=r.customer_account_id
    and c.id=r.customer_account_id and c.role='user' and c.contact_group='customer'
    and c.deleted_at is null and c.locked_at is null;
  if customer is null then return jsonb_build_object('ok',false,'status','customer_invalid'); end if;

  select a.id into admin from public.v21_messages m
  join public.v21_conversations conv on conv.id=m.conversation_id
  join public.v21_accounts a on a.id=case
    when conv.member_a=customer then conv.member_b else conv.member_a end
  where m.id=r.message_id and a.role='admin' and a.deleted_at is null and a.locked_at is null
  limit 1;
  if admin is null then return jsonb_build_object('ok',false,'status','admin_missing'); end if;  -- BANK-202: ledger-only auto collection; notifications are not a prerequisite for a verified credit.
  thousands:=transfer_amount/1000;
  -- SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101:
  -- Acquire the customer lock BEFORE duplicate detection and receipt snapshot.
  perform pg_advisory_xact_lock(hashtextextended('taphoa-money:' || customer::text,0));
  -- Hold only for a manual/unlinked collection of the same amount near this bank
  -- transfer. An earlier AUTO collection, linked to a DIFFERENT consumed Agribank
  -- notification, must not block an independent transfer of the same amount.
  if exists(
    select 1 from public.taphoa_debt_ledger l
    where l.customer_account_id=customer
      and l.entry_type='collection'
      and l.amount_vnd=-thousands
      and l.created_at between transaction_at-interval '30 minutes' and now()
      and not exists (
        select 1 from public.chat_bank_app_collection_links previous_auto
        where previous_auto.ledger_id=l.id
      )
  ) then
    return jsonb_build_object('ok',false,'status','possible_manual_collection');
  end if;
  if exists(select 1 from public.taphoa_command_log where command_id=r.id)
  then return jsonb_build_object('ok',false,'status','command_conflict'); end if;

  before_balance:=public.taphoa_chat_customer_balance_value(customer);
  insert into public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
    values(customer,'collection',-thousands,'Chuyển khoản tự động',admin)
    returning id into ledger;
  perform public.taphoa_bump_revision('debt');
  after_balance:=public.taphoa_chat_customer_balance_value(customer);
  notice:='✅ Đã thu · '||public.taphoa_chat_money(thousands)
    || E'\n'||public.taphoa_chat_balance_label(before_balance,true)
    || E'\n'||public.taphoa_chat_balance_label(after_balance,false)
    || E'\nGhi chú: Chuyển khoản tự động';
  link:=public.taphoa_customer_mini_link(customer,'no',null,null,null);
  if coalesce(link,'')<>'' then notice:=notice||E'\nXem công nợ: '||link; end if;  -- BANK-202: customer already provided a bill; no duplicate auto-acknowledgment bubble.
  message_id:=null;

  result:=jsonb_build_object('ok',true,'customer_id',customer::text,
    'receipt_kind','collection','movement',-thousands,'amount_vnd',thousands,
    'balance_before_vnd',before_balance,'balance_after_vnd',after_balance,
    'receipt_note','Chuyển khoản tự động','receipt_at',now(),
    'notice_sent',message_id is not null);
  insert into public.taphoa_command_log(command_id,operation,result)
    values(r.id,'debt_transaction',result);
  insert into public.chat_bank_app_collection_links(receipt_id,notification_id,ledger_id)
    values(r.id,n.id,ledger);
  update public.chat_bank_bill_receipts
    set status='received',reason='agribank_plus_credit_and_bill_matched',
      ledger_id=ledger,balance_before_thousands=before_balance,
      balance_after_thousands=after_balance
    where id=r.id;
  return jsonb_build_object('ok',true,'status','received','ledger_id',ledger,
    'receipt_id',r.id,'notification_id',n.id,'replayed',false,
    'notice_sent',message_id is not null,'amount_thousands',thousands);
end;
$$;

CREATE OR REPLACE FUNCTION public.chat_bank_manual_collect(p_app_session_id uuid, p_notice_id bigint, p_customer_id uuid, p_note text, p_existing_ledger_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'v21_private', 'pg_temp'
AS $$
DECLARE v_admin uuid; v_notice public.taphoa_agribank_notifications%rowtype;
 v_ledger public.taphoa_debt_ledger%rowtype; v_id bigint;
 v_mode text; v_thousands numeric; v_before numeric; v_after numeric;
 v_message uuid; v_text text; v_link text; v_existing public.chat_bank_manual_collections%rowtype;
 v_credit text[];
BEGIN
 v_admin:=v21_private.require_active_account(p_app_session_id);
 IF NOT EXISTS (SELECT 1 FROM public.v21_accounts a
  WHERE a.id=v_admin AND a.role='admin' AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RAISE EXCEPTION 'admin_only' USING ERRCODE='42501'; END IF;
 IF p_customer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.v21_accounts a
  WHERE a.id=p_customer_id AND a.role='user' AND a.contact_group='customer'
   AND a.deleted_at IS NULL AND a.locked_at IS NULL)
 THEN RETURN jsonb_build_object('ok',false,'status','customer_invalid'); END IF;
 IF length(btrim(coalesce(p_note,''))) NOT BETWEEN 5 AND 1000
 THEN RETURN jsonb_build_object('ok',false,'status','note_required'); END IF;
 -- The automatic collector uses the same advisory lock before locking the notice.
 PERFORM pg_advisory_xact_lock(17812026);
 SELECT * INTO v_notice FROM public.taphoa_agribank_notifications
  WHERE id=p_notice_id FOR UPDATE;
 IF NOT FOUND OR v_notice.status<>'credit_candidate' OR v_notice.is_own_transfer IS DISTINCT FROM false
   OR v_notice.bank_credit_account IS DISTINCT FROM '2901181999999'
   OR v_notice.package_name IS DISTINCT FROM 'com.vnpay.Agribank3g'
   OR v_notice.transfer_at IS NULL
   OR v_notice.amount_vnd IS NULL OR v_notice.amount_vnd<=0
   OR v_notice.amount_vnd>=1000000000000 OR mod(v_notice.amount_vnd,1000)<>0
 THEN RETURN jsonb_build_object('ok',false,'status','invalid_bank_notice'); END IF;
 -- Refuse an event whose raw alert does not actually contain the credited amount.
 v_credit:=regexp_match(v_notice.body,
   '([0-9]{9,20})[[:space:]]*:[[:space:]]*\+[[:space:]]*([0-9][0-9.,]*)[[:space:]]*(VND|VNĐ|Đ)','i');
 IF v_credit IS NULL OR v_credit[1]<>'2901181999999'
   OR v_credit[2] !~ '(^[0-9]{1,12}$|^[0-9]{1,3}([.,][0-9]{3})+$)'
   OR replace(replace(v_credit[2],'.',''),',','')::bigint<>v_notice.amount_vnd
 THEN RETURN jsonb_build_object('ok',false,'status','unverified_bank_credit'); END IF;
 SELECT * INTO v_existing FROM public.chat_bank_manual_collections WHERE notification_id=p_notice_id;
 IF FOUND THEN RETURN jsonb_build_object('ok',false,'status','already_collected',
   'ledger_id',v_existing.ledger_id,'mode',v_existing.mode); END IF;
 IF EXISTS (SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.notification_id=p_notice_id)
 THEN RETURN jsonb_build_object('ok',false,'status','already_auto_collected'); END IF;
 v_thousands:=v_notice.amount_vnd::numeric/1000;
 -- SPEC-FINANCE-CUSTOMER-LOCK-ALL-CHANNELS-20261101:
 -- Lock before checking for manual duplicates and reading ledger balances.
 PERFORM pg_advisory_xact_lock(hashtextextended('taphoa-money:' || p_customer_id::text,0));
 IF p_existing_ledger_id IS NOT NULL THEN
   SELECT * INTO v_ledger FROM public.taphoa_debt_ledger WHERE id=p_existing_ledger_id FOR UPDATE;
   IF NOT FOUND OR v_ledger.customer_account_id<>p_customer_id OR v_ledger.entry_type<>'collection'
      OR v_ledger.amount_vnd<>-v_thousands
      OR v_ledger.created_at NOT BETWEEN v_notice.transfer_at-interval '12 hours'
                                  AND v_notice.transfer_at+interval '7 days'
      OR v_ledger.note ILIKE 'Chuyển khoản tự động%'
      OR EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.ledger_id=v_ledger.id)
      OR EXISTS(SELECT 1 FROM public.chat_bank_manual_collections x WHERE x.ledger_id=v_ledger.id)
   THEN RETURN jsonb_build_object('ok',false,'status','existing_collection_invalid'); END IF;
   v_id:=v_ledger.id; v_mode:='linked_existing';
 ELSE
   IF EXISTS(SELECT 1 FROM public.taphoa_debt_ledger l
     WHERE l.customer_account_id=p_customer_id AND l.entry_type='collection'
      AND l.amount_vnd=-v_thousands
      AND l.created_at BETWEEN v_notice.transfer_at-interval '12 hours'
                           AND v_notice.transfer_at+interval '7 days'
      AND l.note NOT ILIKE 'Chuyển khoản tự động%'
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_app_collection_links x WHERE x.ledger_id=l.id)
      AND NOT EXISTS(SELECT 1 FROM public.chat_bank_manual_collections x WHERE x.ledger_id=l.id))
   THEN RETURN jsonb_build_object('ok',false,'status','possible_manual_collection'); END IF;
   v_before:=public.taphoa_chat_customer_balance_value(p_customer_id);
   INSERT INTO public.taphoa_debt_ledger(customer_account_id,entry_type,amount_vnd,note,created_by_account_id)
   VALUES (p_customer_id,'collection',-v_thousands,
      'Thu Agribank #'||p_notice_id::text||' ('||
      to_char(v_notice.transfer_at AT TIME ZONE 'Asia/Ho_Chi_Minh','DD/MM/YYYY HH24:MI')||
      '): '||btrim(p_note),v_admin) RETURNING id INTO v_id;
   PERFORM public.taphoa_bump_revision('debt');
   v_after:=public.taphoa_chat_customer_balance_value(p_customer_id);
   v_text:='✅ Đã thu · '||public.taphoa_chat_money(v_thousands)
     ||E'\n'||public.taphoa_chat_balance_label(v_before,true)
     ||E'\n'||public.taphoa_chat_balance_label(v_after,false)
     ||E'\nGhi chú: Thu từ Agribank · '||btrim(p_note);
   v_link:=public.taphoa_customer_mini_link(p_customer_id,'no',null,null,null);
   IF coalesce(v_link,'')<>'' THEN v_text:=v_text||E'\nXem công nợ: '||v_link; END IF;
   v_message:=public.taphoa_chat_notify_customer(p_customer_id,v_admin,
      'taphoa:bank-manual:'||p_notice_id::text||':collection',v_text);
   v_mode:='collected';
 END IF;
 INSERT INTO public.chat_bank_manual_collections
  (notification_id,customer_account_id,ledger_id,mode,note,confirmed_by)
 VALUES (p_notice_id,p_customer_id,v_id,v_mode,btrim(p_note),v_admin);
 PERFORM v21_private.chat_bank_report_touch();
 RETURN jsonb_build_object('ok',true,'status',v_mode,'notification_id',p_notice_id::text,
   'ledger_id',v_id,'customer_id',p_customer_id::text,'debt_changed',v_mode='collected',
   'notice_sent',v_message IS NOT NULL,'amount_vnd',v_notice.amount_vnd);
END;$$;
