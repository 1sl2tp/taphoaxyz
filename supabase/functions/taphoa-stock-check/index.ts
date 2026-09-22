import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-customer-pin, x-client-info, apikey, content-type",
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

  async function isAdminRequest(request:Request){
    const header=String(request.headers.get("authorization")||"").trim();
    if(!/^Bearer\s+/i.test(header))return false;
    const token=header.replace(/^Bearer\s+/i,"").trim();
    if(!token)return false;
    const userResult=await db.auth.getUser(token);
    const userId=String(userResult.data?.user?.id||"").trim();
    if(userResult.error||!userId)return false;
    const { data, error } = await db.from("v21_accounts")
      .select("id")
      .eq("auth_user_id",userId)
      .eq("role","admin")
      .is("deleted_at",null)
      .is("locked_at",null)
      .maybeSingle();
    if(error)return false;
    return Boolean(data?.id);
  }

  async function authorizeCustomerSlug(request:Request,slug:string){
    if(await isAdminRequest(request))return {ok:true,admin:true};
    const pin=String(request.headers.get("x-customer-pin")||"").trim();
    if(!pin)return {ok:false,error:"pin_required",status:401};
    const { data, error } = await db.rpc("taphoa_public_pin_check",{
      p_public_slug:slug,
      p_pin:pin
    });
    if(error)throw error;
    if(data?.ok===true)return {ok:true,admin:false};
    return {
      ok:false,
      error:String(data?.error||"pin_invalid"),
      status:String(data?.error||"")==="pin_locked"?423:403,
      remaining:data?.remaining,
      retry_after:data?.retry_after
    };
  }

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
        const access=await authorizeCustomerSlug(req,slug);
        if(!access.ok)return json({
          ok:false,error:access.error,remaining:access.remaining,retry_after:access.retry_after
        },access.status||403);
        if(String(url.searchParams.get("access")||"")==="1"){
          return json({ok:true,access:"granted",admin:access.admin===true});
        }
        const customerId = await customerIdFromSlug(slug);
        const links = await ensureStockLinks(customerId);
        const { data, error } = await db.rpc("taphoa_stock_check_snapshot", { p_token: links.owner });
        if (error) throw error;
        const snapshot:any = data || { ok:false, error:"empty_snapshot" };
        if (snapshot?.ok) {
          snapshot.employee_url = `https://app.taphoa.xyz/kiemhang/?t=${links.employee}`;
          snapshot.owner_url = `https://app.taphoa.xyz/kh/?kh=${encodeURIComponent(slug)}&tab=hang`;
        }
        return json(snapshot);
      }

      if (!token) return json({ ok:false, error:"token_required" }, 400);
      const { data, error } = await db.rpc("taphoa_stock_check_snapshot", { p_token: token });
      if (error) throw error;
      const snapshot:any = data || { ok:false, error:"empty_snapshot" };
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

      if (!token && slug) {
        const access=await authorizeCustomerSlug(req,slug);
        if(!access.ok)return json({
          ok:false,error:access.error,remaining:access.remaining,retry_after:access.retry_after
        },access.status||403);
        const customerId = await customerIdFromSlug(slug);
        const links = await ensureStockLinks(customerId);
        token = String(links.owner || "");
      }
      if (!token) return json({ ok:false, error:"token_required" }, 400);
      if (items.length > 1000) return json({ ok:false, error:"too_many_items" }, 400);

      const normalized = items.map((item:any) => ({
        product_code:String(item?.product_code || "").trim(),
        qty:Math.max(0, Number(item?.qty) || 0)
      })).filter((item:any) => item.product_code);

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