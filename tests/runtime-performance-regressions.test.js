import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('background sync only refreshes UI domains that actually changed',async()=>{
  const [bridge,overrides]=await Promise.all([
    read('src/fixed-production-bridge.js'),
    read('src/fixed-production-overrides.js')
  ]);

  assert.match(bridge,/const changed=changedDomains\(before\.revisions,meta\?\.revisions\|\|\{\}\)/);
  assert.match(bridge,/const permissionsChanged=/);
  assert.match(bridge,/if\(changed\.length\|\|permissionsChanged\)/);
  assert.match(bridge,/detail:\{changed,permissionsChanged\}/);

  assert.match(overrides,/const sheetNamesByDomain=Object\.freeze\(\{/);
  assert.match(overrides,/products:\['sanpham'\]/);
  assert.match(overrides,/customers:\['khachhang'\]/);
  assert.match(overrides,/orders:\['dontam','dongiao'\]/);
  assert.match(overrides,/debt:\['thuchi'\]/);
  assert.match(overrides,/const names=sheetsForChangedDomains\(changed\)/);
  assert.match(overrides,/if\(!names\.length\)return/);
  assert.match(overrides,/refreshFixedSheets\(names\)/);
});

test('logout clears the account-scoped production snapshot',async()=>{
  const bridge=await read('src/fixed-production-bridge.js');
  assert.match(bridge,/async function logout\(\)\{[\s\S]*const uid=currentUid\(\)/);
  assert.match(bridge,/if\(uid\)snapshot\.clear\(uid\)/);
  assert.match(bridge,/finally\{[\s\S]*identity=null;bootstrapped=false;appState\.reset\(\)/);
});

test('app shell stays hidden until authentication restore resolves',async()=>{
  const [markup,runtime]=await Promise.all([
    read('src/fixed-ui-markup-1.js'),
    read('src/fixed-ui-runtime-4.js')
  ]);
  assert.match(markup,/id=\\\"appContainer\\\" style=\\\"display:none\\\"/);
  assert.match(runtime,/app\.style\.display = 'none'/);
  assert.match(runtime,/app\.style\.removeProperty\('display'\)/);
});

test('PWA keeps versioned assets fast without globally forcing no-store',async()=>{
  const sw=await read('sw.js');
  assert.match(sw,/taphoa-runtime-v36/);
  assert.match(sw,/async function staleWhileRevalidate/);
  assert.match(sw,/url\.searchParams\.has\('v'\)/);
  assert.match(sw,/request\.destination==='image'\|\|request\.destination==='font'/);
  assert.match(sw,/request\.mode==='navigate'\|\|request\.destination==='document'/);
  assert.match(sw,/cache:'no-cache'/);
  assert.match(sw,/version\.json[\s\S]*cache:'no-store'/);
  const networkFirst=sw.match(/async function networkFirst\(request\)\{([\s\S]*?)\n\}/)?.[1]||'';
  assert.doesNotMatch(networkFirst,/cache:'no-store'/);
});


test('TAPHOA revision sync is event-driven with no visible-tab interval poll',async()=>{
  const [bridge,migration]=await Promise.all([
    read('src/fixed-production-bridge.js'),
    read('supabase/migrations/20261005043000_taphoa_revision_realtime_signal.sql')
  ]);

  assert.match(bridge,/channel\('taphoa-revisions-v1'\)/);
  assert.match(bridge,/event:'\*',schema:'public',table:'taphoa_revisions'/);
  assert.match(bridge,/function scheduleRevisionWake\(\)/);
  assert.match(bridge,/setTimeout\(\(\)=>\{[\s\S]*syncOnce\(\)/);
  assert.doesNotMatch(bridge,/syncTimer=setInterval/);
  assert.doesNotMatch(bridge,/setInterval\(\(\)=>\{[\s\S]*syncOnce\(\)/);

  assert.match(migration,/grant select on table public\.taphoa_revisions to anon, authenticated/i);
  assert.match(migration,/revoke insert, update, delete on table public\.taphoa_revisions from anon, authenticated/i);
  assert.match(migration,/create policy "taphoa_revisions_signal_read"/i);
  assert.match(migration,/alter publication supabase_realtime add table public\.taphoa_revisions/i);
});
