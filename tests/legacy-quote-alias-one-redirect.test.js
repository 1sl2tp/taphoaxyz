import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../bao-gia-sua/index.html',import.meta.url),'utf8');
test('legacy quote route retains search and fragment via one navigation owner',()=>{
 const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match,'legacy quote must have a client redirect');
 const values=[
  {query:'?kh=sample&group=sua',hash:'#section',expected:'/bao-gia/?kh=sample&group=sua#section'},
  {query:'',hash:'',expected:'/bao-gia/'}
 ];
 for(const v of values){
  const redirects=[];
  vm.runInNewContext(match[1],{location:{search:v.query,hash:v.hash,replace:url=>redirects.push(url)}});
  assert.deepEqual(redirects,[v.expected]);
 }
 assert.doesNotMatch(html,/<meta[^>]*http-equiv=["']refresh["']/i,
   'a 0-second meta refresh can preempt query/hash-preserving script redirect');
 assert.match(html,/<a href="\/bao-gia\/">Báo giá<\/a>/,
   'quote link must remain usable when scripting is disabled');
 assert.doesNotMatch(html,/setTimeout\(|fetch\(|\.rpc\(/,
   'shortcut must not add polling, RPC or a second job');
});
test('real quote route remains the canonical public quote page',()=>{
 const target=readFileSync(new URL('../bao-gia/index.html',import.meta.url),'utf8');
 assert.match(target,/<html/i);
 assert.match(target,/<title>/i);
});
