import {readFileSync} from 'node:fs';

const repoRoot=new URL('../../',import.meta.url);
const localImport=/@import\s+["'](\.[^"']+\.css)["']\s*;/g;

function expandCss(url,seen){
  if(seen.has(url.href))return '';
  seen.add(url.href);
  const source=readFileSync(url,'utf8');
  return source.replace(localImport,(statement,specifier)=>`${statement}\n${expandCss(new URL(specifier,url),seen)}`);
}

export function readTailwindSourceSync(){
  return expandCss(new URL('src/styles/taphoa-tailwind.input.css',repoRoot),new Set());
}
