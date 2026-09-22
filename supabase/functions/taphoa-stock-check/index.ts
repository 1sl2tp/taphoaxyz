import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
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

  try {
    if (req.method === "GET") {
      const token = String(url.searchParams.get("t") || "").trim();
      if (!token) return json({ ok:false, error:"token_required" }, 400);
      const { data, error } = await db.rpc("taphoa_stock_check_snapshot", { p_token: token });
      if (error) throw error;
      const snapshot:any = data || { ok:false, error:"empty_snapshot" };
      if (snapshot?.ok && snapshot?.role === "owner" && snapshot?.customer_id) {
        const [employeeLink, publicLink] = await Promise.all([
          db.from("taphoa_stock_check_links")
            .select("token")
            .eq("customer_account_id", String(snapshot.customer_id))
            .eq("link_role", "employee")
            .eq("is_active", true)
            .maybeSingle(),
          db.rpc("v21_customer_public_link_info_get_or_create", { p_customer_id: String(snapshot.customer_id) })
        ]);
        const employeeToken = String(employeeLink.data?.token || "").trim();
        const slug = String(publicLink.data?.public_slug || "").trim();
        if (employeeToken) snapshot.employee_url = `https://app.taphoa.xyz/kiemhang/?t=${employeeToken}`;
        if (slug) snapshot.owner_url = `https://app.taphoa.xyz/kh/?kh=${encodeURIComponent(slug)}&tab=kiemhang&t=${encodeURIComponent(token)}`;
      }
      return json(snapshot);
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const token = String(body?.token || "").trim();
      const action = String(body?.action || "save").trim().toLowerCase();
      const items = Array.isArray(body?.items) ? body.items : [];
      if (!token) return json({ ok:false, error:"token_required" }, 400);
      if (items.length > 1000) return json({ ok:false, error:"too_many_items" }, 400);

      const normalized = items.map((item:any) => ({
        product_code:String(item?.product_code || "").trim(),
        qty:Math.max(0, Number(item?.qty) || 0)
      })).filter((item:any) => item.product_code);

      const { data, error } = await db.rpc("taphoa_stock_check_submit", {
        p_token: token,
        p_items: normalized,
        p_action: action
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