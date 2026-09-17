import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const migrations=fs.readdirSync(path.join(root,'supabase/migrations'))
  .filter(name=>name.endsWith('.sql'))
  .map(name=>fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'))
  .join('\n');
const business=fs.readFileSync(path.join(root,'src/core/business.js'),'utf8');
const bridge=fs.readFileSync(path.join(root,'src/fixed-production-bridge.js'),'utf8');
const runtime=fs.readFileSync(path.join(root,'src/fixed-ui-runtime-2.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'supabase/functions/taphoa-sheet-sync/index.ts'),'utf8');

test('source management is Sheet-owned and web has no source mutation path',()=>{
  assert.match(worker,/reconcileSources/);
  assert.match(worker,/management_sheet_id/);
  assert.match(worker,/taphoa_sources/);
  assert.doesNotMatch(business,/directSheetMutation|createSource\s*:|deleteSource\s*:/);
  assert.doesNotMatch(bridge,/async\s+function\s+createSource|async\s+function\s+deleteSource/);
  assert.doesNotMatch(runtime,/TAPHOA_PRODUCTION\.createSource|TAPHOA_PRODUCTION\.deleteSource/);
  assert.match(migrations,/revoke\s+execute\s+on\s+function\s+public\.taphoa_create_source_from_web\(text\)\s+from\s+authenticated/i);
  assert.match(migrations,/revoke\s+execute\s+on\s+function\s+public\.taphoa_delete_source_from_web\(text\)\s+from\s+authenticated/i);
});
