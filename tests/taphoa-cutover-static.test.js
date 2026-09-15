import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','src');

function readRuntime(dir){
  return fs.readdirSync(dir,{withFileTypes:true})
    .flatMap(entry=>{
      const full=path.join(dir,entry.name);
      if(entry.isDirectory())return readRuntime(full);
      return /\.(?:js|css|html)$/i.test(entry.name)?[fs.readFileSync(full,'utf8')]:[];
    })
    .join('\n');
}

const runtime=readRuntime(root);

test('runtime is fully cut over to the shared TAPHOA project and namespace',()=>{
  assert.match(runtime,/gcnoahqsrquxkwkjbuxy\.supabase\.co/);
  assert.match(runtime,/taphoa_access_context/);
  assert.match(runtime,/taphoa_app_bootstrap/);
  assert.match(runtime,/taphoa_save_order/);
  assert.doesNotMatch(runtime,/crdbhkdeqyehsbzgggbs/);
  assert.doesNotMatch(runtime,/getlink-api|get\.taphoa\.xyz/i);
  assert.doesNotMatch(runtime,/shop-auth|shop_identities/i);
});

test('runtime never calls retired generic business RPC names',()=>{
  assert.doesNotMatch(runtime,/\.rpc\(\s*['"](?:app_bootstrap|app_meta|app_domains|save_order|deliver_order|reverse_order|delete_pending_order|batch_orders|debt_transaction)['"]/i);
});
