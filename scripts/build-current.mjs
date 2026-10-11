import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {cp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('index.html','dist/index.html');
await cp('admin-gia.html','dist/admin-gia.html');
await cp('manifest.webmanifest','dist/manifest.webmanifest');
await cp('version.json','dist/version.json');
await cp('sw.js','dist/sw.js');
await cp('src','dist/src',{recursive:true});
await cp('no','dist/no',{recursive:true});
await cp('d','dist/d',{recursive:true});
await cp('b','dist/b',{recursive:true});
await cp('kiemhang','dist/kiemhang',{recursive:true});
await cp('kh','dist/kh',{recursive:true});
await cp('bao-gia-sua','dist/bao-gia-sua',{recursive:true});
await cp('bao-gia','dist/bao-gia',{recursive:true});
await cp('ncc','dist/ncc',{recursive:true});
await cp('ghi-chu','dist/ghi-chu',{recursive:true});

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

// Compile exactly once in CI/build. Never run Tailwind CDN/JIT in the client.
const cssFile='dist/src/tailwind.generated.css';
const cli=path.resolve('node_modules/tailwindcss/lib/cli.js');
const compiled=spawnSync(process.execPath, [
  cli, '--input','src/tailwind.input.css','--output',cssFile,
  '--config','tailwind.config.cjs','--minify'
],{encoding:'utf8',maxBuffer:8*1024*1024});
if(compiled.error||compiled.status!==0){
  throw new Error('Tailwind static CSS build failed: '+String(compiled.stderr||compiled.error||compiled.status));
}
const css=await readFile(cssFile,'utf8');
if(css.length<20000||css.length>500000){
  throw new Error('Unexpected Tailwind CSS size '+css.length+' bytes');
}
// Fail the release if core Bán hàng layout / login / palette utilities were missed.
const requiredSelectors=['.flex{','.hidden{','.fixed{','.w-full{','.bg-primary{','.text-primary{','.text-white{','.rounded-xl{'];
for(const selector of requiredSelectors){
  if(!css.includes(selector))throw new Error('Tailwind missing required selector '+selector);
}
const cssHash=createHash('sha256').update(css).digest('hex').slice(0,16);
const cssIndex='dist/index.html';
const unversionedIndex=await readFile(cssIndex,'utf8');
if(!unversionedIndex.includes('tailwind.generated.css?v=BUILD_CSS_HASH')){
  throw new Error('Missing Tailwind CSS version placeholder in index.html');
}
await writeFile(cssIndex,unversionedIndex.replace('BUILD_CSS_HASH',cssHash));

// Hash the complete release including the new compiled CSS and its versioned URL.
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
