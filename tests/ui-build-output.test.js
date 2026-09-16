import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';

const indexHtml=readFileSync(new URL('../index.html', import.meta.url),'utf8');

for(const match of indexHtml.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']\.\/([^"']+)["']/g)){
  const filePath=new URL(`../${match[1]}`, import.meta.url);
  test(`stylesheet exists: ${match[1]}`,()=>{
    assert.equal(existsSync(filePath),true,`Missing stylesheet referenced by index.html: ${match[1]}`);
  });
}
