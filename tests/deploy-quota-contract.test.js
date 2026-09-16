import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8').catch(()=> '');

test('production build stamps the deployment SHA into emitted index and version',async()=>{
  const build=await read('scripts/build-current.mjs');
  assert.match(build,/VERCEL_GIT_COMMIT_SHA/);
  assert.match(build,/GITHUB_SHA/);
  assert.match(build,/dist\/index\.html/);
  assert.match(build,/dist\/version\.json/);
  assert.match(build,/app-build-id/);
});

test('Vercel builds only when runtime changed since the last successful deployment',async()=>{
  const cfg=JSON.parse(await read('vercel.json'));
  assert.equal(cfg.buildCommand,'npm run build:production');
  assert.equal(cfg.outputDirectory,'dist');
  assert.match(cfg.ignoreCommand,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(cfg.ignoreCommand,/git diff --quiet/);
  for(const path of ['index.html','package.json','sw.js','version.json','src','scripts','vercel.json']){
    assert.ok(cfg.ignoreCommand.includes(path),`ignoreCommand missing ${path}`);
  }
});

test('build identity audit cannot create recursive main commits',async()=>{
  const workflow=await read('.github/workflows/publish-version-marker.yml');
  assert.match(workflow,/workflow_dispatch/);
  assert.match(workflow,/contents:\s*read/);
  assert.doesNotMatch(workflow,/contents:\s*write/);
  assert.doesNotMatch(workflow,/git push/);
});

test('production smoke only auto-runs for runtime paths',async()=>{
  const workflow=await read('.github/workflows/taphoa-production-cutover-smoke.yml');
  assert.match(workflow,/paths:/);
  for(const path of ['index.html','package.json','sw.js','version.json','src/**','scripts/**','vercel.json']){
    assert.ok(workflow.includes(path),`production smoke missing ${path}`);
  }
});
