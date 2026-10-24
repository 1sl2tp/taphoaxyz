-- CYCLE-196 fix: automatic notification routing requires :debt suffix
-- so existing global/customer send_debt preferences are honored (not bypassed).
DO $patch$
DECLARE def text; oldtext text:='v_id:=''taphoa:cycle-due:''||md5(v_customer.id::text||'':''||v_start::text);'; newtext text:='v_id:=''taphoa:cycle-due:''||md5(v_customer.id::text||'':''||v_start::text)||'':debt'';';
BEGIN
 SELECT pg_get_functiondef('v21_private.taphoa_cycle_send_due_notices()'::regprocedure) INTO def;
 IF position(newtext IN def)>0 THEN RETURN; END IF;
 IF position(oldtext IN def)=0 THEN RAISE EXCEPTION 'cycle_due_notification_id_anchor_missing'; END IF;
 EXECUTE replace(def,oldtext,newtext);
END;
$patch$;