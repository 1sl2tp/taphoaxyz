import {readFile,readdir,mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
const ROOT=process.cwd(), DIST=path.join(ROOT,"dist"), ASSET_PARTS=path.join(ROOT,"assets","v132");
const file=path.join(DIST,"index.html");
let html=await readFile(file,"utf8");
const inputSha=createHash("sha256").update(Buffer.from(html)).digest("hex");
if(inputSha!=="c84556378b868334bd4c430d3184e49613058cabb7e76c4d231a280063fe77c7") throw Error(`V1.31 SHA mismatch ${inputSha}`);
const replace=(a,b,label)=>{if(!html.includes(a))throw Error(`Missing V1.32 patch target: ${label}`);html=html.replace(a,b);};
replace('<link rel="icon" type="image/jpeg" href="./src/assets/logo.jpg"/>\n  <link rel="apple-touch-icon" href="./src/assets/logo.jpg"/>','<link rel="icon" type="image/png" sizes="64x64" href="./assets/favicon-64.png"/>\n  <link rel="apple-touch-icon" sizes="192x192" href="./assets/app-icon-192.png"/>',"head icons");
const blend='background:"transparent",mixBlendMode:"multiply",';
if((html.match(new RegExp(blend.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"))||[]).length!==2) throw Error("Expected 2 web-logo blend targets");
html=html.replaceAll(blend,'background:"white",');
replace("taphoa_ui_cache_v31_","taphoa_ui_cache_v32_","cache namespace");
await mkdir(path.join(DIST,"assets"),{recursive:true});
for(const [stem,expectedSha] of [
  ["app-icon-192.png","08eadf5c39b39b57272bee42f168b0bf1133c54039307273934ff3c0a9c3bc91"],
  ["favicon-64.png","0bc18107274bfd743e5d245318adaafdfab5110d537ef0caced15c3e4f9064b3"]
]){
  const files=(await readdir(ASSET_PARTS)).filter(x=>x.startsWith(stem+".b64.part")).sort();
  if(!files.length) throw Error(`Missing parts for ${stem}`);
  const b64=(await Promise.all(files.map(f=>readFile(path.join(ASSET_PARTS,f),"utf8")))).join("");
  const bytes=Buffer.from(b64,"base64");
  const sha=createHash("sha256").update(bytes).digest("hex");
  if(sha!==expectedSha) throw Error(`${stem} SHA mismatch ${sha}`);
  await writeFile(path.join(DIST,"assets",stem),bytes);
}
const out=Buffer.from(html), sha=createHash("sha256").update(out).digest("hex");
if(out.length!==192096) throw Error(`V1.32 bytes ${out.length} != 192096`);
if(sha!=="803c9d65de24c4403967c63944d505ac34e6f0101be580dd6c7f9c9eb25fd90b") throw Error(`V1.32 SHA mismatch ${sha}`);
if((html.match(/api\.call\("/g)||[]).length!==29) throw Error("Business API call count changed");
if(!html.includes("https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/taphoa-api")) throw Error("Supabase HTTPS endpoint changed");
if(html.includes('localStorage.setItem("taphoa_session"')||html.includes('localStorage.getItem("taphoa_session")')) throw Error("V1.29 session hardening regressed");
await writeFile(file,out);
console.log(`LOGO PASS V1.32 ${out.length} ${sha}`);
