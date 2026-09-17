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

test('source creation is persisted Web -> Supabase and refreshed back to the editor',()=>{
  assert.match(migrations,/create\s+or\s+replace\s+function\s+public\.taphoa_create_source_from_web/i);
  assert.match(migrations,/insert\s+into\s+public\.taphoa_sources/i);
  assert.match(migrations,/domain\s*=\s*'products'/i);
  assert.match(business,/createSource\s*:\s*.*taphoa_create_source_from_web/s);
  assert.match(bridge,/async\s+function\s+createSource\s*\(/);
  assert.match(bridge,/TAPHOA_PRODUCTION[\s\S]*createSource/);
  assert.match(runtime,/saveNewProductEditorSource\s*\([^)]*\)[\s\S]*TAPHOA_PRODUCTION\.createSource/);
});
