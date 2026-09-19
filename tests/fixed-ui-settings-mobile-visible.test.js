import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('mobile settings content and logout stay visible inside the active settings tab',async()=>{
  const markup=await readFile('src/fixed-ui-markup-3.js','utf8');
  const css=await readFile('src/fixed-ui-source-4.css','utf8');

  assert.match(markup,/id=\\?"tab-cai-dat\\?"/);
  assert.match(markup,/id=\\?"settingsMain\\?"/);
  assert.match(markup,/id=\\?"btnLogoutApp\\?"[\s\S]{0,260}logoutApp\(\)/);

  assert.match(css,/#tab-cai-dat\.active\s*\{[\s\S]{0,260}display:flex\s*!important[\s\S]{0,260}flex:1 1 0%\s*!important/);
  assert.match(css,/#settingsMain\s*\{[\s\S]{0,260}overflow-y:auto\s*!important/);
  assert.match(css,/#btnLogoutApp\s*\{[\s\S]{0,120}display:flex\s*!important/);
});
