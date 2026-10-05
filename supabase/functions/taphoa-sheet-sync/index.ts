// RETIRED: TAPHOA product/catalog data is Supabase-only.
// Keep this HTTP tombstone only so stale Google Drive webhooks/callers fail closed.
// No Google API calls, no Supabase reads/writes, no cron/watch registration.

Deno.serve(() => new Response(
  JSON.stringify({ok:false,error:"taphoa_google_sheet_sync_retired"}),
  {
    status:410,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"no-store"
    }
  }
));
