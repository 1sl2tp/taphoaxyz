import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const worker=fs.readFileSync(path.join(root,'supabase/functions/taphoa-sheet-sync/index.ts'),'utf8');

test('sheet sync releases the Supabase lock without calling .catch on an RPC builder',()=>{
  assert.doesNotMatch(worker,/admin\.rpc\([^;\n]*taphoa_release_sheet_sync_lock[^;\n]*\)\.catch\(/);
  assert.match(worker,/const\s*\{\s*error\s*:\s*releaseError\s*\}\s*=\s*await\s+admin\.rpc\("taphoa_release_sheet_sync_lock"/);
});
