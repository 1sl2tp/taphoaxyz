import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('logout clears hidden product, source and market detail DOM as well as in-memory state',()=>{
 assert.match(html,/SPEC-ADMIN-LOGOUT-DOM-PRIVACY-20261101/);
 for(const call of [
   "\$('productBody'\)\.replaceChildren\(\)",
   "\$('sourceChips'\)\.replaceChildren\(\)",
   "\$('comparisonBody'\)\.replaceChildren\(\)",
   "\$('marketCurrent'\)\.replaceChildren\(\)",
   "\$('marketCandidateTags'\)\.replaceChildren\(\)",
   "\$('historyBody'\)\.replaceChildren\(\)"
 ])assert.match(html,new RegExp(call));
 assert.match(html,/\$\('statusText'\)\.classList\.remove\('error'\)/);
 assert.match(html,/\$\('sourceForm'\)\.reset\(\);\$\('productForm'\)\.reset\(\)/);
});
test('browser navigation warns only if an authenticated admin has edits or pending writes',()=>{
 assert.match(html,/window\.addEventListener\('beforeunload',e=>\{/);
 assert.match(html,/const dirty=Boolean\(\$\('productBody'\)\.querySelector\('tr\[data-dirty="1"\]'\)\)/);
 assert.match(html,/identity\?\.role==='admin'&&\(dirty\|\|saveQueues\.size>0\)/);
 assert.match(html,/e\.preventDefault\(\);\s*e\.returnValue=''/);
});
