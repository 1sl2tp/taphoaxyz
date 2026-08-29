import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import path from "node:path";
const d="dist", html=await readFile(path.join(d,"index.html"),"utf8");
const required=[
  'rel="icon" type="image/png" sizes="64x64" href="./assets/favicon-64.png"',
  'rel="apple-touch-icon" sizes="192x192" href="./assets/app-icon-192.png"',
  'taphoa_ui_cache_v32_',
  'background:"white",'
];
for(const x of required)if(!html.includes(x))throw Error(`Missing V1.32 contract: ${x}`);
for(const x of ['rel="icon" type="image/jpeg" href="./src/assets/logo.jpg"','rel="apple-touch-icon" href="./src/assets/logo.jpg"','mixBlendMode:"multiply"'])if(html.includes(x))throw Error(`Forbidden V1.32 token: ${x}`);
if((html.match(/api\.call\("/g)||[]).length!==29)throw Error("Business API calls changed");
const manifest=JSON.parse(await readFile(path.join(d,"manifest.webmanifest"),"utf8"));
if(manifest.icons?.[0]?.src!=="./assets/app-icon-192.png")throw Error("Manifest app icon not separated");
for(const [name,sha] of [["app-icon-192.png","08eadf5c39b39b57272bee42f168b0bf1133c54039307273934ff3c0a9c3bc91"],["favicon-64.png","0bc18107274bfd743e5d245318adaafdfab5110d537ef0caced15c3e4f9064b3"]]){
  const b=await readFile(path.join(d,"assets",name));
  if(createHash("sha256").update(b).digest("hex")!==sha)throw Error(`${name} mismatch`);
}
console.log("TEST PASS V1.32 logo/login/iPhone/favicon split");
