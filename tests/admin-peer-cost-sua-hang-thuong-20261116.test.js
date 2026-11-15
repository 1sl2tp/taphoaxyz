import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('one read-only peer cost column is next to editable cost, with named source',()=>{
 assert.match(page,/<th data-col="cost">Giá vốn<\/th>\s*<th data-col="peer_cost" id="peerCostHeader"/);
 assert.match(page,/<td data-col="peer_cost" class="readonly peer-cost pending"/);
 assert.match(page,/selectedSource==='sua'\?'Vốn Hàng thường'/);
 assert.match(page,/selectedSource==='hang-thuong'\?'Vốn Sữa'/);
 assert.match(page,/col\.id==='peer_cost'&&!compareSourceVisible/);
 assert(!page.includes('data-field="peer_cost"'),'must not become a writable payload');
});
test('exact normalized matching resolves only unique entries and leaves duplicates ambiguous',()=>{
 const begin=page.indexOf('    function crossSourceName(value){');
 const end=page.indexOf('\n    function crossSourceMatches(){',begin);
 const indexFrom=page.indexOf('    function uniquePeerCostIndex(');
 const indexTo=page.indexOf('\n    // Read the whole matching peer-source result',indexFrom);
 assert(begin>=0&&end>begin&&indexFrom>=0&&indexTo>indexFrom);
 const ctx=vm.createContext({});
 vm.runInContext("const num=value=>value===null||value===undefined||String(value).trim()===''?null:Number(value);\n"+page.slice(begin,end)+'\n'+page.slice(indexFrom,indexTo)+"\nglobalThis.lookup=uniquePeerCostIndex;",ctx);
 const index=ctx.lookup([
   {source_key:'hang-thuong',product_name:'  SỮA BO  BÉ ',cost:225},
   {source_key:'hang-thuong',product_name:'Sữa bò ít',cost:226},
   {source_key:'hang-thuong',product_name:'Sữa bò ít',cost:230},
   {source_key:'sua',product_name:'Sữa bò bé',cost:227},
   {source_key:'hang-thuong',product_name:'Sữa bò to',cost:0}
 ],'hang-thuong');
 assert.equal(index.get('sữa bo bé').count,1);
 assert.equal(index.get('sữa bo bé').cost,225);
 assert.equal(index.get('sữa bò ít').count,2);
 assert.equal(index.get('sữa bò to').cost,0);
 assert.equal(index.has('sữa bò lít'),false);
});
test('paged read-only RPC is complete-or-fail and does not affect price writes',()=>{
 assert.match(page,/async function fetchPeerCostProducts\(source,query,isCurrent\)/);
 assert.match(page,/p_query:query,p_source:source,p_limit:PAGE_SIZE,p_offset:offset/);
 assert.match(page,/if\(offset\+batch\.length>=totalCount\)return matches/);
 assert.match(page,/if\(batch\.length!==PAGE_SIZE\)throw new Error/);
 assert.match(page,/sessionGeneration===catalogSessionGeneration/);
 assert.match(page,/identity\?\.uid===adminUid&&selectedSource===source/);
 assert.match(page,/void loadPeerCostColumn\(/);
 assert.match(page,/async function loadPeerCostColumn/);
 assert.match(page,/rpc\('taphoa_update_product_from_web',\{p_product:payload\}\)/);
 assert.doesNotMatch(page,/payload\.peer_cost|data-field="peer_cost"/);
});
