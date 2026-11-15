import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
function helpers(){
  const normalBegin=source.indexOf('    function crossSourceName(value){');
  const normalEnd=source.indexOf('\n    function crossSourceMatches(){',normalBegin);
  const begin=source.indexOf('    function uniquePeerCostIndex(');
  const end=source.indexOf('\n    // Read the whole matching peer-source result',begin);
  assert(normalBegin>=0&&normalEnd>normalBegin&&begin>=0&&end>begin);
  const c=vm.createContext({});
  const js="const num=value=>value===null||value===undefined||String(value).trim()===''?null:Number(value);\n"
    +source.slice(normalBegin,normalEnd)+'\n'+source.slice(begin,end)
    +'\nglobalThis.api={peerNameTokens,peerNamePrefixMatch,uniquePeerCostIndex,peerCostMatch};';
  vm.runInContext(js,c);
  return c.api;
}
test('sua su lo cam matches unique shorter sua su lo with visible approximate marker',()=>{
 const {uniquePeerCostIndex,peerCostMatch,peerNamePrefixMatch}=helpers();
 const data=[{source_key:'hang-thuong',product_name:'Sua su lo',cost:158},
   {source_key:'hang-thuong',product_name:'Sua bò to',cost:347}];
 const index=uniquePeerCostIndex(data,'hang-thuong');
 const res=peerCostMatch('SUA  SU  LO   CAM',index,data,'hang-thuong');
 assert.equal(res.kind,'approximate');assert.equal(res.cost,158);
 assert.equal(res.name,'Sua su lo');
 assert.equal(peerNamePrefixMatch('Sữa su lo cam','Sua su lo'),true);
 assert.match(source,/cell\.textContent=usable\?\(approximate\?'≈ ':''\)\+pretty\(cost\):'—'/);
 assert.match(source,/cell\.classList\.toggle\('approximate',approximate\)/);
});
test('exact match wins, ambiguous source duplicates and different variants do not guess',()=>{
 const {uniquePeerCostIndex,peerCostMatch,peerNamePrefixMatch}=helpers();
 const rows=[
   {source_key:'hang-thuong',product_name:'Sua su lo',cost:158},
   {source_key:'hang-thuong',product_name:'Sua su lo cam',cost:170},
   {source_key:'hang-thuong',product_name:'Sua su lo cam',cost:171},
   {source_key:'hang-thuong',product_name:'Sua su lo dau',cost:166}
 ];
 const index=uniquePeerCostIndex(rows,'hang-thuong');
 assert.equal(peerCostMatch('sua su lo',index,rows,'hang-thuong').kind,'exact');
 assert.equal(peerCostMatch('sua su lo cam',index,rows,'hang-thuong').kind,'ambiguous');
 assert.equal(peerCostMatch('sua su lo chanh',index,rows,'hang-thuong').kind,'approximate');
 assert.equal(peerNamePrefixMatch('sua su lo dau','sua su lo cam'),false);
 assert.equal(peerNamePrefixMatch('sua su lo cam 180ml','sua su lo'),false);
 assert.equal(peerNamePrefixMatch('sua bo','sua go'),false);
 const ambiguous=[
   {source_key:'hang-thuong',product_name:'Sua su lo',cost:158},
   {source_key:'hang-thuong',product_name:'Sữa su lo',cost:160}
 ];
 assert.equal(peerCostMatch('Sua su lo cam',uniquePeerCostIndex(ambiguous,'hang-thuong'),ambiguous,'hang-thuong').kind,'ambiguous');
});
test('peer lookup is unfiltered, read only, session-fenced and paginated',()=>{
 assert.match(source,/fetchPeerCostProducts\(otherSource,'',active\)/);
 assert.match(source,/p_query:query,p_source:source,p_limit:PAGE_SIZE,p_offset:offset/);
 assert.match(source,/sessionGeneration===catalogSessionGeneration/);
 assert.match(source,/identity\?\.uid===adminUid&&selectedSource===source/);
 assert.match(source,/if\(offset\+batch\.length>=totalCount\)return matches/);
 assert.doesNotMatch(source,/data-field="peer_cost"|payload\.peer_cost/);
});
