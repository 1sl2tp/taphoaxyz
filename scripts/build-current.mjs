import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';

const buildId=(process.env.VERCEL_GIT_COMMIT_SHA||process.env.GITHUB_SHA||'').trim();

await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
await cp('index.html','dist/index.html');
await cp('manifest.webmanifest','dist/manifest.webmanifest');
await cp('version.json','dist/version.json');
await cp('sw.js','dist/sw.js');
await cp('src','dist/src',{recursive:true});

if(buildId){
  const indexPath='dist/index.html';
  let index=await readFile(indexPath,'utf8');
  const marker=/(<meta\s+name=["']app-build-id["']\s+content=["'])[^"']*(["']\s*\/?>)/i;
  if(!marker.test(index))throw new Error('Missing app-build-id marker in dist/index.html');
  index=index.replace(marker,(_match,open,close)=>`${open}${buildId}${close}`);
  await writeFile(indexPath,index);

  const versionPath='dist/version.json';
  const version=JSON.parse(await readFile(versionPath,'utf8'));
  version.build_id=buildId;
  version.published_from=process.env.VERCEL_GIT_COMMIT_SHA?'vercel-git':'build-environment';
  await writeFile(versionPath,`${JSON.stringify(version,null,2)}\n`);
}

console.log(`CURRENT PRODUCTION BUILD PASS${buildId?` ${buildId}`:''}`);
