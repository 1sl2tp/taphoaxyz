import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('index.html','dist/index.html');
await cp('manifest.webmanifest','dist/manifest.webmanifest');
await cp('version.json','dist/version.json');
await cp('sw.js','dist/sw.js');
await cp('src','dist/src',{recursive:true});
await cp('no','dist/no',{recursive:true});
await cp('d','dist/d',{recursive:true});
await cp('b','dist/b',{recursive:true});
await cp('kiemhang','dist/kiemhang',{recursive:true});

const toPosix=value=>value.split(path.sep).join('/');

async function listFiles(dir,root=dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...await listFiles(full,root));
    else files.push(toPosix(path.relative(root,full)));
  }
  return files.sort();
}

function normalizeBuildIdentity(relativePath,buffer){
  if(relativePath==='index.html'){
    const text=buffer.toString('utf8');
    return Buffer.from(text.replace(/(<meta\s+name=["']app-build-id["']\s+content=["'])[^"']*(["']\s*\/?>)/i,'$1$2'));
  }
  if(relativePath==='version.json'){
    const version=JSON.parse(buffer.toString('utf8'));
    version.build_id='';
    version.published_from='';
    return Buffer.from(JSON.stringify(version));
  }
  return buffer;
}

const files=await listFiles('dist');
const digest=createHash('sha256');
for(const relativePath of files){
  digest.update(relativePath);
  digest.update('\0');
  digest.update(normalizeBuildIdentity(relativePath,await readFile(path.join('dist',relativePath))));
  digest.update('\0');
}
const buildId=`content-${digest.digest('hex').slice(0,20)}`;

const indexPath='dist/index.html';
let index=await readFile(indexPath,'utf8');
const marker=/(<meta\s+name=["']app-build-id["']\s+content=["'])[^"']*(["']\s*\/?>)/i;
if(!marker.test(index))throw new Error('Missing app-build-id marker in dist/index.html');
index=index.replace(marker,(_match,open,close)=>`${open}${buildId}${close}`);
await writeFile(indexPath,index);

const versionPath='dist/version.json';
const version=JSON.parse(await readFile(versionPath,'utf8'));
version.build_id=buildId;
version.published_from='main-content';
await writeFile(versionPath,`${JSON.stringify(version,null,2)}\n`);

const stampedIndex=await readFile(indexPath,'utf8');
const stampedMeta=stampedIndex.match(/<meta\s+name=["']app-build-id["']\s+content=["']([^"']+)["']/i)?.[1]||'';
if(stampedMeta!==buildId)throw new Error(`Stamped app-build-id mismatch: ${stampedMeta||'<empty>'} != ${buildId}`);
const stampedVersion=JSON.parse(await readFile(versionPath,'utf8'));
if(stampedVersion.build_id!==buildId)throw new Error(`Stamped version build_id mismatch: ${stampedVersion.build_id||'<empty>'} != ${buildId}`);

console.log(`CURRENT PRODUCTION BUILD PASS ${buildId}`);
