import {CONFIG} from './config.js';

export function createSupabaseGateway({clientProvider,config=CONFIG}={}) {
  let provider=clientProvider;
  if (!provider) {
    let client=null;let promise=null;
    provider=async()=>{
      if(client)return client;
      if(!promise){
        promise=import(config.supabaseModuleUrl).then(mod=>{
          client=mod.createClient(config.supabaseUrl,config.publishableKey,{
            auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:localStorage}
          });
          return client;
        }).finally(()=>{promise=null;});
      }
      return promise;
    };
  }
  return {
    async rpc(name,args={}) {
      const client=await provider();
      const {data,error}=await client.rpc(name,args);
      if(error){
        const err=Object.assign(new Error(error.message||String(error.code||'RPC_ERROR')),{code:String(error.code||'RPC_ERROR'),details:error.details||''});
        throw err;
      }
      return data;
    },
    async invoke(name,{body={}}={}) {
      const client=await provider();
      const {data,error}=await client.functions.invoke(name,{body});
      if(error){
        const err=Object.assign(new Error(error.message||String(error.code||'FUNCTION_ERROR')),{code:String(error.code||'FUNCTION_ERROR'),details:error.details||''});
        throw err;
      }
      return data;
    }
  };
}
