import {CONFIG} from './config.js';

export function normalizeIdentity(context={}) {
  const accountId=String(context.account_id||context.uid||'');
  return {
    uid:accountId,
    username:String(context.username||''),
    role:String(context.taphoa_role||context.role||'').toLowerCase(),
    maKH:accountId,
    displayName:String(context.display_name||context.displayName||context.username||''),
    active:context.allowed===true||context.active===true
  };
}

function normalizeUsername(value){
  return String(value||'').trim().toLowerCase();
}

export function createAuthService({config=CONFIG}={}) {
  let client=null;
  let clientPromise=null;
  const getClient=async()=>{
    if(client)return client;
    if(!clientPromise){
      clientPromise=import(config.supabaseModuleUrl).then(mod=>{
        client=mod.createClient(config.supabaseUrl,config.publishableKey,{
          auth:{
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:false,
            storage:localStorage,
            storageKey:config.authStorageKey
          }
        });
        return client;
      }).finally(()=>{clientPromise=null;});
    }
    return clientPromise;
  };

  const clearHint=()=>localStorage.removeItem(config.identityStorageKey);
  const saveHint=identity=>localStorage.setItem(config.identityStorageKey,JSON.stringify(normalizeIdentity(identity)));
  const localSignOut=async c=>{try{await c.auth.signOut({scope:'local'});}catch{try{await c.auth.signOut();}catch{}}};
  const readAccess=async c=>{
    const {data,error}=await c.rpc('taphoa_access_context');
    if(error)throw Object.assign(new Error('Không kiểm tra được quyền Tạp hóa'),{code:'ACCESS_CHECK_FAILED',cause:error});
    if(data?.allowed!==true){
      throw Object.assign(new Error('Tài khoản không có quyền vào Tạp hóa'),{code:'TAPHOA_ACCESS_DENIED'});
    }
    return normalizeIdentity(data);
  };

  const login=async(username,password)=>{
    const normalized=normalizeUsername(username);
    const c=await getClient();
    const {data,error}=await c.auth.signInWithPassword({
      email:`${normalized}@taphoa.chat`,
      password:String(password||'')
    });
    if(error||!data?.session?.user?.id){
      throw Object.assign(new Error('Sai tài khoản hoặc mật khẩu'),{code:'INVALID_CREDENTIALS',cause:error});
    }
    try{
      const identity=await readAccess(c);
      saveHint(identity);
      return {session:data.session,identity,client:c};
    }catch(error){
      clearHint();
      await localSignOut(c);
      throw error;
    }
  };

  const restore=async()=>{
    const c=await getClient();
    const {data,error}=await c.auth.getSession();
    if(error||!data?.session?.user?.id)return null;
    try{
      const identity=await readAccess(c);
      saveHint(identity);
      return {session:data.session,identity,client:c};
    }catch(error){
      clearHint();
      if(error?.code==='TAPHOA_ACCESS_DENIED')await localSignOut(c);
      return null;
    }
  };

  const logout=async()=>{
    try{const c=await getClient();await localSignOut(c);}
    finally{clearHint();}
  };

  return {getClient,login,restore,logout};
}