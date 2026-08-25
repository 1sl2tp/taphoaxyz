const DEFAULT_CACHE_VERSION=1;
const KEY_PREFIX='taphoa.snapshot.v1:';
const SNAPSHOT_FIELDS=['version','syncSeconds','revisions','products','sources','customers','orders','debtSummary','printSettings','selfCustomer','permissions','user'];

export function createSnapshotStore({storage=globalThis.localStorage,cacheVersion=DEFAULT_CACHE_VERSION}={}){
  const key=uid=>`${KEY_PREFIX}${String(uid||'')}`;
  return {
    load(uid){
      if(!uid||!storage)return null;
      try{
        const raw=storage.getItem(key(uid));
        if(!raw)return null;
        const snapshot=JSON.parse(raw);
        if(snapshot?.cacheVersion!==cacheVersion||String(snapshot?.uid)!==String(uid)||!snapshot?.data)return null;
        return snapshot;
      }catch{return null;}
    },
    save(uid,state={}){
      if(!uid||!storage)return false;
      try{
        const data={};
        for(const field of SNAPSHOT_FIELDS)if(Object.hasOwn(state,field))data[field]=state[field];
        storage.setItem(key(uid),JSON.stringify({cacheVersion,uid:String(uid),savedAt:Date.now(),data}));
        return true;
      }catch{return false;}
    },
    clear(uid){
      if(!uid||!storage)return;
      try{storage.removeItem(key(uid));}catch{}
    }
  };
}
