import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const srcDir=path.join(root,'src');

function filesUnder(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...filesUnder(full));
    else if(/\.(?:js|html)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const moneySuffixPatterns=[
  /(["'`])\s*đ\s*\1/,
  /\$\{[^}\n]+\}\s*đ\b/,
  /\b\d[\d.,]*\s*đ\b/
];

test('money displays do not append the đ currency suffix anywhere in the production source',()=>{
  const hits=[];
  for(const file of filesUnder(srcDir)){
    const rel=path.relative(root,file);
    const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
    lines.forEach((line,index)=>{
      if(moneySuffixPatterns.some(pattern=>pattern.test(line))){
        hits.push(`${rel}:${index+1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits,[],`currency suffix remains:\n${hits.join('\n')}`);
});
