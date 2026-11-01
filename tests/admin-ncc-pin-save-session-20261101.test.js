import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../ncc/admin/index.html',import.meta.url),'utf8');
test('successful PIN rotation keeps the new PIN and copy action available',()=>{
 assert.match(html,/SPEC-NCC-PIN-COPY-AFTER-SAVE-20261101/);
 const body=html.split("card.querySelector('.save-pin').addEventListener('click',async()=>{")[1].split("\n    });")[0];
 assert.doesNotMatch(body,/await load\(\)/);
 assert.match(body,/card\.querySelector\('\.source-meta'\)\.textContent='PIN: Đã cấu hình/);
 assert.match(body,/Bấm “Sao chép PIN”/);
 assert.match(body,/revision!==sessionRevision\|\|identity\?\.uid!==adminUid/);
});
test('logout drops old NCC cards and blocks stale async lists',()=>{
 assert.match(html,/SPEC-NCC-ADMIN-SESSION-FENCE-20261101/);
 assert.match(html,/function clearNccAdminSession\(\)\{\s*sessionRevision\+\+;listRequestRevision\+\+;/);
 assert.match(html,/\$\('list'\)\.replaceChildren\(\)/);
 assert.match(html,/request!==listRequestRevision\)return/);
});
test('an old NCC response cannot render after a new session begins',async()=>{
 const start=html.indexOf('async function load(){');
 const end=html.indexOf('\n\nasync function enter(info)',start);
 assert.ok(start>=0&&end>start);
 let release;const pending=new Promise(resolve=>release=resolve);
 const state={rendered:0};
 const ctx=vm.createContext({state,pending,console,Promise,Array});
 vm.runInContext(`
  let identity={uid:'A',role:'admin'},sessionRevision=1,listRequestRevision=0;
  const rpc=async()=>pending;
  const render=()=>state.rendered++;
  const $=()=>({textContent:''});
  ${html.slice(start,end)}
  globalThis.api={load,nextSession:()=>{sessionRevision++;identity={uid:'B',role:'admin'}}};
 `,ctx);
 const task=ctx.api.load();
 ctx.api.nextSession();release({items:[{source_key:'old'}]});
 await task;
 assert.equal(state.rendered,0);
});
