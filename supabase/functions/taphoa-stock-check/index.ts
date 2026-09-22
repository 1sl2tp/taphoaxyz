import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-employee-pin",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "cache-control": "no-store"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRole) return json({ ok:false, error:"server_config_missing" }, 500);

  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }
  });

  async function customerIdFromSlug(slug:string){
    const { data, error } = await db.from("v21_customer_public_links")
      .select("customer_account_id")
      .eq("public_slug", slug)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    const id = String(data?.customer_account_id || "").trim();
    if (!id) throw new Error("customer_not_found");
    return id;
  }

  async function employeePinState(customerId:string){
    let { data, error } = await db.from("v21_customer_public_links")
      .select("public_slug,pin_set_at")
      .eq("customer_account_id", customerId)
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;

    if (!data?.public_slug) {
      const created = await db.rpc("v21_customer_public_link_info_get_or_create", { p_customer_id: customerId });
      if (created.error) throw created.error;
      const retry = await db.from("v21_customer_public_links")
        .select("public_slug,pin_set_at")
        .eq("customer_account_id", customerId)
        .is("revoked_at", null)
        .maybeSingle();
      if (retry.error) throw retry.error;
      data = retry.data;
    }

    return {
      slug:String(data?.public_slug || "").trim(),
      configured:Boolean(data?.pin_set_at)
    };
  }

  async function requireEmployeePin(snapshot:any, pin:string){
    if (!snapshot?.ok || snapshot?.role !== "employee" || !snapshot?.customer_id) return { ok:true };

    const state = await employeePinState(String(snapshot.customer_id));
    if (!state.slug || !state.configured) {
      return { ok:false, status:403, error:"owner_pin_not_set" };
    }
    if (!/^\d{6}$/.test(pin)) {
      return { ok:false, status:401, error:"pin_required" };
    }

    const checked = await db.rpc("taphoa_public_pin_check", {
      p_public_slug: state.slug,
      p_pin: pin
    });
    if (checked.error) throw checked.error;
    if (checked.data?.ok === true) return { ok:true };

    const code = String(checked.data?.error || "pin_invalid");
    if (code === "pin_locked") {
      return { ok:false, status:429, error:"pin_locked", retry_after:Number(checked.data?.retry_after)||600 };
    }
    return { ok:false, status:401, error:"pin_invalid" };
  }

  async function pendingOrderInfo(orderId:unknown){
    const id=String(orderId||"").trim();
    if(!id)return null;
    const { data, error } = await db.from("taphoa_orders")
      .select("id,status,display_prefix,display_no")
      .eq("id",id)
      .eq("status","pending")
      .maybeSingle();
    if(error)throw error;
    if(!data?.id)return null;
    const prefix=String(data.display_prefix||"DT").trim()||"DT";
    const no=Number(data.display_no)||0;
    return {
      id:String(data.id),
      display_code:no>0?`${prefix}${no}`:""
    };
  }

  async function ensureStockLinks(customerId:string){
    const read = async() => {
      const { data, error } = await db.from("taphoa_stock_check_links")
        .select("link_role,token")
        .eq("customer_account_id", customerId)
        .eq("is_active", true);
      if (error) throw error;
      const out:any = {};
      for (const row of (data || [])) out[String(row.link_role)] = String(row.token || "");
      return out;
    };

    let links = await read();
    if (links.owner && links.employee) return links;

    const { data: admin, error: adminError } = await db.from("v21_accounts")
      .select("id")
      .eq("role", "admin")
      .is("deleted_at", null)
      .is("locked_at", null)
      .order("created_at", { ascending:true })
      .limit(1)
      .maybeSingle();
    if (adminError) throw adminError;
    const adminId = String(admin?.id || "").trim();
    if (!adminId) throw new Error("admin_not_found");

    const missing = ["owner","employee"].filter(role => !links[role]).map(role => ({
      customer_account_id: customerId,
      link_role: role,
      created_by_account_id: adminId,
      is_active: true
    }));
    if (missing.length) {
      const { error } = await db.from("taphoa_stock_check_links")
        .upsert(missing, { onConflict:"customer_account_id,link_role" });
      if (error) throw error;
    }
    links = await read();
    if (!links.owner || !links.employee) throw new Error("stock_check_link_invalid");
    return links;
  }

  try {
    if (req.method === "GET") {
      const token = String(url.searchParams.get("t") || "").trim();
      const slug = String(url.searchParams.get("kh") || "").trim();

      if (slug) {
        const customerId = await customerIdFromSlug(slug);

        if (String(url.searchParams.get("sync") || "") === "1") {
          const { data: session, error: sessionError } = await db.from("taphoa_stock_check_sessions")
            .select("id,status,employee_submitted_at,owner_reviewed_at,updated_at,pending_order_id")
            .eq("customer_account_id", customerId)
            .order("updated_at", { ascending:false })
            .limit(1)
            .maybeSingle();
          if (sessionError) throw sessionError;
          if (!session?.id) return json({ ok:true, session:null, items:[] });

          const { data: items, error: itemsError } = await db.from("taphoa_stock_check_items")
            .select("product_code,employee_qty,owner_qty")
            .eq("session_id", String(session.id))
            .order("product_code", { ascending:true });
          if (itemsError) throw itemsError;
          const pending_order=await pendingOrderInfo(session?.pending_order_id);
          return json({ ok:true, session, items:items || [], pending_order });
        }

        const links = await ensureStockLinks(customerId);
        const { data, error } = await db.rpc("taphoa_stock_check_snapshot", { p_token: links.owner });
        if (error) throw error;
        const snapshot:any = data || { ok:false, error:"empty_snapshot" };
        if (snapshot?.ok) {
          snapshot.employee_url = `https://app.taphoa.xyz/kiemhang/?t=${links.employee}`;
          snapshot.owner_url = `https://app.taphoa.xyz/kh/?kh=${encodeURIComponent(slug)}&tab=hang`;
          const { data: latestSession, error: latestSessionError } = await db.from("taphoa_stock_check_sessions")
            .select("pending_order_id")
            .eq("customer_account_id", customerId)
            .order("updated_at", { ascending:false })
            .limit(1)
            .maybeSingle();
          if(latestSessionError)throw latestSessionError;
          snapshot.pending_order=await pendingOrderInfo(latestSession?.pending_order_id);
        }
        return json(snapshot);
      }

      if (!token) return json({ ok:false, error:"token_required" }, 400);
      const { data, error } = await db.rpc("taphoa_stock_check_snapshot", { p_token: token });
      if (error) throw error;
      const snapshot:any = data || { ok:false, error:"empty_snapshot" };
      if (!snapshot?.ok) return json(snapshot, 404);

      if (snapshot?.role === "employee") {
        const pin = String(req.headers.get("x-employee-pin") || "").trim();
        const access:any = await requireEmployeePin(snapshot, pin);
        if (!access.ok) return json(access, access.status);
      }

      if (snapshot?.ok && snapshot?.role === "owner" && snapshot?.customer_id) {
        const publicLink = await db.rpc("v21_customer_public_link_info_get_or_create", { p_customer_id: String(snapshot.customer_id) });
        const slug = String(publicLink.data?.public_slug || "").trim();
        if (slug) snapshot.owner_url = `https://app.taphoa.xyz/kh/?kh=${encodeURIComponent(slug)}&tab=hang`;
      }
      return json(snapshot);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      let token = String(body?.token || "").trim();
      const slug = String(body?.kh || "").trim();
      const action = String(body?.action || "save").trim().toLowerCase();
      const items = Array.isArray(body?.items) ? body.items : [];

      const normalized = items.map((item:any) => ({
        product_code:String(item?.product_code || "").trim(),
        qty:Math.max(0, Number(item?.qty) || 0)
      })).filter((item:any) => item.product_code);

      if (action === "save_pending_order") {
        if (!slug) return json({ ok:false, error:"customer_required" }, 400);
        if (normalized.length > 500) return json({ ok:false, error:"too_many_items" }, 400);
        const { data, error } = await db.rpc("taphoa_public_save_stock_draft", {
          p_public_slug: slug,
          p_items: normalized
        });
        if (error) throw error;
        return json(data || { ok:true });
      }

      if (!token && slug) {
        const customerId = await customerIdFromSlug(slug);
        const links = await ensureStockLinks(customerId);
        token = String(links.owner || "");
      }
      if (!token) return json({ ok:false, error:"token_required" }, 400);
      if (items.length > 1000) return json({ ok:false, error:"too_many_items" }, 400);

      if (!slug) {
        const snapshotResult = await db.rpc("taphoa_stock_check_snapshot", { p_token: token });
        if (snapshotResult.error) throw snapshotResult.error;
        const snapshot:any = snapshotResult.data || { ok:false, error:"empty_snapshot" };
        if (!snapshot?.ok) return json(snapshot, 404);
        if (snapshot?.role === "employee") {
          const pin = String(req.headers.get("x-employee-pin") || "").trim();
          const access:any = await requireEmployeePin(snapshot, pin);
          if (!access.ok) return json(access, access.status);
        }
      }

      const { data, error } = await db.rpc("taphoa_stock_check_submit", {
        p_token: token,
        p_items: normalized,
        p_action: slug ? "update" : action
      });
      if (error) throw error;
      return json(data || { ok:true });
    }

    return json({ ok:false, error:"method_not_allowed" }, 405);
  } catch (error:any) {
    const message = String(error?.message || error || "unknown_error");
    const invalid = /stock_check_link_invalid|customer_not_found/i.test(message);
    return json({ ok:false, error: invalid ? "link_invalid" : "request_failed" }, invalid ? 404 : 500);
  }
});