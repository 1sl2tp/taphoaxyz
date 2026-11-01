import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-MOBILE-SAVE-STATUS-20261101:');
const end=page.indexOf('\n\n    function queueSave(row)',start);
assert.ok(start>=0&&end>start);
function cls(){
 const values=new Set();
 return {add(x){values.add(x)},remove(...xs){xs.forEach(x=>values.delete(x))},toggle(x,on){if(on)values.add(x);else values.delete(x)},contains(x){return values.has(x)}};
}
function fixture(){
 const table={rows:[],querySelector(sel){if(sel!=='tr.error')throw Error(sel);return this.rows.find(x=>x.classList.contains('error'))||null;}};
 const summary={classList:cls()};
 const status={textContent:'previous error',title:'old error',classList:cls(),closest:()=>summary};
 const context=vm.createContext({table,summary,status});
 vm.runInContext(`
  const $=id=>id==='productBody'?table:status;
  const setTimeout=()=>0;
  ${page.slice(start,end)}
  globalThis.markRow=markRow;
 `,context);
 const row=()=>({classList:cls()});
 return {table,summary,status,markRow:context.markRow,row};
}
test('a validation failure remains conspicuous without expanding normal layout',()=>{
 const f=fixture(),row=f.row();f.table.rows=[row];
 f.markRow(row,'error');
 assert.equal(f.status.classList.contains('error'),true);
 assert.equal(f.summary.classList.contains('has-save-error'),true);
 f.markRow(row,'saving');
 f.markRow(row,'saved');
 assert.equal(f.summary.classList.contains('has-save-error'),false);
 assert.equal(f.status.textContent,'Đã lưu');
 assert.equal(f.status.title,'');
});
test('when another row is still erroneous the save banner remains visible',()=>{
 const f=fixture(),bad=f.row(),good=f.row();f.table.rows=[bad,good];
 f.markRow(bad,'error');
 f.markRow(good,'saved');
 assert.equal(f.summary.classList.contains('has-save-error'),true);
 assert.equal(f.status.classList.contains('error'),true);
 assert.equal(f.status.textContent,'previous error');
});
test('mobile style exposes error text without limiting it to 64 pixels',()=>{
 assert.match(page,/#goodsPane \.summary\.has-save-error \.status \.msg\.error\{/);
 assert.match(page,/display:block;max-width:none;font-size:12px/);
 assert.match(page,/white-space:normal;overflow:visible;overflow-wrap:anywhere/);
});
