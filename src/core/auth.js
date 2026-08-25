import {CONFIG} from './config.js';

export function normalizeIdentity(identity={}) {
  return {
    uid:String(identity.uid||''),
    username:String(identity.shop_account_key||identity.username||''),
    role:String(identity.role||'').toLowerCase(),
    maKH:String(identity.ma_kh||identity.maKH||''),
    displayName:String(identity.display_name||identity.displayName||identity.shop_account_key||identity.username||''),
    active:identity.active !== false
  };
}

export function createAuthService({config=CONFIG}={}) {
  let client=null;
  let clientPromise=null;
  const getClient=async()=>{
    if (client) return client;
    if (!clientPromise) {
      clientPromise=import(config.supabaseModuleUrl).then(mod=>{
        client=mod.createClient(config.supabaseUrl,config.publishableKey,{
          auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:localStorage}
        });
        return client;
      }).finally(()=>{clientPromise=null;});
    }
    return clientPromise;
  };
  const readIdentity=async(c,uid)=>{
    const {data,error}=await c.from('shop_identities')
      .select('uid,shop_account_key,role,ma_kh,display_name,active')
      .eq('uid',uid).maybeSingle();
    if (error || !data?.active) throw Object.assign(new Error('Tài khoản không hoạt động'),{code:'ACCOUNT_DISABLED'});
    return normalizeIdentity(data);
  };
  const saveHint=identity=>localStorage.setItem(config.identityStorageKey,JSON.stringify(normalizeIdentity(identity)));
  const clearHint=()=>localStorage.removeItem(config.identityStorageKey);
  const login=async(username,password)=>{
    let response;
    try {
      response=await fetch(config.authUrl,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':config.publishableKey},
        body:JSON.stringify({username:String(username||'').trim(),password:String(password||'')}),
        cache:'no-store'
      });
    } catch {
      throw Object.assign(new Error('Không kết nối được'),{code:'NETWORK'});
    }
    const payload=await response.json().catch(()=>null);
    if (!payload?.ok || !payload?.data?.session) throw Object.assign(new Error('Sai tài khoản hoặc mật khẩu'),{code:String(payload?.code||'INVALID_CREDENTIALS')});
    const c=await getClient();
    const {data,error}=await c.auth.setSession(payload.data.session);
    if (error || !data?.session?.user?.id) throw Object.assign(new Error('Phiên đăng nhập không hợp lệ'),{code:'SESSION_REQUIRED'});
    const identity=await readIdentity(c,data.session.user.id);
    saveHint(identity);
    return {session:data.session,identity,client:c};
  };
  const restore=async()=>{
    const c=await getClient();
    const {data,error}=await c.auth.getSession();
    if (error || !data?.session?.user?.id) return null;
    try {
      const identity=await readIdentity(c,data.session.user.id);
      saveHint(identity);
      return {session:data.session,identity,client:c};
    } catch (error) {
      if (navigator.onLine === false) {
        try {
          const hint=normalizeIdentity(JSON.parse(localStorage.getItem(config.identityStorageKey)||'null')||{});
          if (hint.uid===data.session.user.id && hint.active) return {session:data.session,identity:hint,client:c,offline:true};
        } catch {}
      }
      if (navigator.onLine !== false) await c.auth.signOut().catch(()=>{});
      clearHint();
      return null;
    }
  };
  const logout=async()=>{
    try { const c=await getClient(); await c.auth.signOut().catch(()=>{}); }
    finally { clearHint(); }
  };
  return {getClient,login,restore,logout};
}
