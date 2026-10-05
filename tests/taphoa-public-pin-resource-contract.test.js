import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(new URL('../supabase/migrations/20261005155737_coalesce_public_pin_success_writes.sql',import.meta.url),'utf8');

test('successful public PIN checks do not rewrite an already-clean security state',()=>{
  assert.match(migration,/coalesce\(v_link\.pin_fail_count,0\)<>0 or v_link\.pin_locked_until is not null/);
  assert.match(migration,/set pin_fail_count=0,pin_locked_until=null,updated_at=now\(\)/);
  assert.match(migration,/v_fail := coalesce\(v_link\.pin_fail_count,0\)\+1/);
  assert.match(migration,/v_fail>=5/);
  assert.match(migration,/pin_locked_until=now\(\)\+interval '10 minutes'/);
});
