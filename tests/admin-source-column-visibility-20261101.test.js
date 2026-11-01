import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('source chips expose pressed state and keep selected source in scroll viewport',()=>{
 assert.match(html,/SPEC-ADMIN-COLUMN-SOURCE-USABILITY-20261101/);
 assert.match(html,/aria-pressed="\$\{selectedSource===s\.source_key\}"/);
 assert.match(html,/const host=\$\('sourceChips'\),priorScroll=host\.scrollLeft/);
 assert.match(html,/if\(chosen\.left<visible\.left\)host\.scrollLeft-=/);
 assert.match(html,/else if\(chosen\.right>visible\.right\)host\.scrollLeft\+=/);
});
test('column preference restore never hides all columns',()=>{
 assert.match(html,/if\(hidden\.length===valid\.size\)hidden\.splice\(hidden\.indexOf\('name'\),1\)/);
 assert.match(html,/if\(!e\.target\.checked&&COLUMN_DEFS\.filter\(col=>!columnPrefs\.hidden\.includes\(col\.id\)\)\.length<=1\)/);
});
