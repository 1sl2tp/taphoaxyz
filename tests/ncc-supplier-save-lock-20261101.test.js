import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../ncc/index.html',import.meta.url),'utf8');
test('NCC price save blocks overlapping writes and freezes inputs for the request',()=>{
 assert.match(html,/SPEC-NCC-SUPPLIER-SAVE-LOCK-20261101/);
 assert.match(html,/if\(savingSupplierChanges\|\|!session\?\.token\)return/);
 assert.match(html,/savingSupplierChanges=true;/);
 assert.match(html,/document\.querySelectorAll\('#rows input'\)\.forEach\(input=>\{input\.disabled=true;\}\)/);
 assert.match(html,/document\.querySelectorAll\('#rows input'\)\.forEach\(input=>\{input\.disabled=false;\}\)/);
 assert.match(html,/if\(sessionGeneration!==supplierSessionGeneration\|\|session\?\.token!==token\)return;/);
});
test('failed saves keep existing drafts and old sessions cannot paint a new session',()=>{
 assert.match(html,/catch\(err\)\{\s*if\(sessionGeneration!==supplierSessionGeneration\|\|session\?\.token!==token\)return/);
 assert.match(html,/clearSupplierSession\(\);showLogin\('Phiên đã hết hạn/);
 assert.match(html,/finally\{\s*if\(sessionGeneration===supplierSessionGeneration&&session\?\.token===token\)\{/);
});
test('NCC warns before logout or page navigation if there are draft prices',()=>{
 assert.match(html,/function hasSupplierDrafts\(\)/);
 assert.match(html,/savingSupplierChanges\|\|hasSupplierDrafts\(\)\)\&\&!confirm/);
 assert.match(html,/window\.addEventListener\('beforeunload',event=>/);
 assert.match(html,/event\.preventDefault\(\);event\.returnValue=''/);
});
