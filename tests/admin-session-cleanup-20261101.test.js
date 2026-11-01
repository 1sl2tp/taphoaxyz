import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
test('logout stops polling, flushes price edits and clears admin caches',()=>{
 assert.match(page,/SPEC-ADMIN-SESSION-CLEANUP-20261101/);
 assert.match(page,/clearTimeout\(marketStatusTimer\);marketStatusTimer=0/);
 assert.match(page,/catalogSessionGeneration\+\+;marketSessionGeneration\+\+;analyticsSessionGeneration\+\+/);
 assert.match(page,/analyticsLoading=false;analyticsReloadQueued=false;analyticsLoaded=false/);
 assert.match(page,/marketItems=\[\];marketSources=\[\];marketTotal=0/);
 assert.match(page,/if\(!await flushProductEditsBeforeReload\(\)&&!confirm/);
 assert.match(page,/resetAdminSessionDisplays\(\);showLogin\(\)/);
});
test('async analytics does not overwrite another admin session or changed period',()=>{
 assert.match(page,/const generation=analyticsSessionGeneration/);
 assert.match(page,/if\(generation!==analyticsSessionGeneration\|\|identity\?\.uid!==adminUid\)return/);
 assert.match(page,/if\(analyticsReloadQueued\)return/);
});
test('late catalog and market results from old login are discarded',()=>{
 assert.match(page,/if\(sessionGeneration!==catalogSessionGeneration\)return/);
 assert.match(page,/if\(sessionGeneration!==marketSessionGeneration\)return/);
 assert.match(page,/if\(identity\?\.uid!==adminUid\)return/);
});
