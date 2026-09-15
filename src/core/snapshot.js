const DEFAULT_CACHE_VERSION=3;
const KEY_PREFIX='taphoa.snapshot.v3:';
const LEGACY_KEY_PREFIXES=['taphoa.snapshot.v1:','taphoa.snapshot.v2:'];
const SNAPSHOT_FIELDS=['version','syncSeconds','revisions','products','sources','customers','orders','debtSummary','printSettings','selfCustomer','permissions','user'];

export function createSnapshotStore({storage=globalThis.localStorage,cacheVersion=DEFAULT_CACHE_VERSION}={}){
  const key=uid=>`${KEY_PREFIX}${String(uid||'')}`;
  const purgeLegacy=uid=>{for(const prefix of LEGACY_KEY_PREFIXES)storage.removeItem(`${prefix}${String(uid||'')}`);};
  return {
    load(uid){
      if(!uid||!storage)return null;
      try{
        purgeLegacy(uid);
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
        purgeLegacy(uid);
        const data={};
        for(const field of SNAPSHOT_FIELDS)if(Object.hasOwn(state,field))data[field]=state[field];
        storage.setItem(key(uid),JSON.stringify({cacheVersion,uid:String(uid),savedAt:Date.now(),data}));
        return true;
      }catch{return false;}
    },
    clear(uid){
      if(!uid||!storage)return;
      try{purgeLegacy(uid);storage.removeItem(key(uid));}catch{}
    }
  };
}