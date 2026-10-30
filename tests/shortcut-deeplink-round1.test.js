import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const routes=[
  {file:'b/index.html',base:'/kh/',key:'tab',fixed:'hang'},
  {file:'d/index.html',base:'/kh/',key:'tab',fixed:'don'},
  {file:'no/index.html',base:'/kh/',key:'tab',fixed:'no'},
  {file:'ncc/sua/index.html',base:'/ncc/',key:'s',fixed:'sua'},
  {file:'ncc/hang-thuong/index.html',base:'/ncc/',key:'s',fixed:'hang-thuong'},
  {file:'ncc/hang-u/index.html',base:'/ncc/',key:'s',fixed:'hang-u'},
  {file:'ncc/thuoc-la/index.html',base:'/ncc/',key:'s',fixed:'thuoc-la'}
];
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function openShortcut(html,{search='',hash=''}={}) {
  const match=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,'shortcut needs same-origin script redirect');
  let destination=null,calls=0;
  const location={search,hash,replace(url){calls++;destination=url;}};
  vm.runInNewContext(match[1],{URLSearchParams,location});
  assert.equal(calls,1,'one user navigation must make only one redirect');
  return new URL(destination,'https://app.taphoa.xyz/');
}

for(const route of routes){
  test('TAPHOA shortcut '+route.file+' retains query/hash and pins route authority',()=>{
    const html=read(route.file);
    const target=openShortcut(html,{
      search:'?tracking=a%20b&kh=customer-42&tab=poison&s=wrong&fixed=0',
      hash:'#details/item-7'
    });
    assert.equal(target.origin,'https://app.taphoa.xyz');
    assert.equal(target.pathname,route.base);
    assert.equal(target.searchParams.get('tracking'),'a b');
    assert.equal(target.searchParams.get('kh'),'customer-42');
    assert.equal(target.hash,'#details/item-7');
    assert.equal(target.searchParams.get(route.key),route.fixed,
      'original tab/s source must be overridden by shortcut');
    if(route.base==='/ncc/')assert.equal(target.searchParams.get('fixed'),'1',
      'supplier shortcut must remain fixed and cannot disable source PIN restriction');
    assert.equal(openShortcut(html).pathname,route.base);
    assert.match(html,/<a href="\/(kh|ncc)\/\?/,
      'page must show an accessible same-origin navigation fallback when scripting is off');
    assert.match(html,/<html lang="vi">/);
    assert.doesNotMatch(html,/<meta[^>]*http-equiv="refresh"/i,
      'unconditional meta-refresh can race with JS and strip query/fragment');
    assert.doesNotMatch(html,/fetch\(|\.rpc\(|setTimeout\(/,
      'redirect cannot add provider calls or timers');
  });
}
test('Canonical destination still handles identity and fixed-source parameters',()=>{
 const supplier=read('ncc/index.html');
 const customer=read('kh/index.html');
 assert.match(supplier,/const params=new URLSearchParams\(location.search\)/);
 assert.match(supplier,/const fixedSource=params.get\('fixed'\)==='1'/);
 assert.match(supplier,/const paramSource=params.get\('s'\)/);
 assert.match(customer,/const kh=String\(params.get\('kh'\)/);
});
