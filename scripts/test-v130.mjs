import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const file="dist/index.html";
const html=await readFile(file,"utf8");
const checks=[
  ["iPhone viewport lock",html.includes("#root{position:fixed")&&html.includes("height:100dvh")&&html.includes(".app-screen-scroll")],
  ["seller swipe",html.includes('const SELLER_SWIPE_TABS=["sell","orders","nguon","debt","profile"]')&&html.includes('data-swipe-lock="true"')],
  ["selection guard",html.includes(".taphoa-app,.taphoa-app button")&&html.includes(".taphoa-app input,.taphoa-app textarea,.taphoa-app select")],
  ["realtime search",html.includes('onInput={e=>setSearch(e.currentTarget.value)}')&&html.includes('onCompositionEnd={e=>setSearch(e.currentTarget.value)}')],
  ["logo no white field",html.includes('mixBlendMode:"multiply"')&&html.includes('background:"transparent"')],
  ["security preserved",!html.includes('localStorage.getItem("taphoa_session")')&&!html.includes('localStorage.setItem("taphoa_session"')],
  ["business API count",(html.match(/api\.call\("/g)||[]).length===29],
  ["Supabase endpoint",html.includes("https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/taphoa-api")],
];
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok)process.exitCode=1;}
const bytes=Buffer.from(html);const sha=createHash("sha256").update(bytes).digest("hex");
if(bytes.length!==190838||sha!=="6cb723e10067444e3095d494162a4739895ac1e514d5f7a870b8d0e5cd3efedc"){console.error(`FAIL artifact ${bytes.length} ${sha}`);process.exitCode=1;}else console.log(`PASS artifact ${bytes.length} ${sha}`);
if(process.exitCode)throw Error("V1.30 contract failed");
