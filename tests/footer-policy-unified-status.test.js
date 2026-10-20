import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const [runtime,policy,style,shell,publicTools]=await Promise.all([
 readFile('src/fixed-ui-runtime-1.js','utf8'),
 readFile('src/customer-policy-notice.js','utf8'),
 readFile('src/customer-policy-notice.css','utf8'),
 readFile('index.html','utf8'),
 readFile('src/fixed-production-overrides.js','utf8')
]);

function list(...values){
 const set=new Set(values);
 return {contains:k=>set.has(k),add:(...keys)=>keys.forEach(k=>set.add(k)),
  remove:(...keys)=>keys.forEach(k=>set.delete(k))};
}

function toastHarness(inline=true){
 const bar={dataset:inline?{policyInline:'true',statusView:'policy'}:{},
   classList:list('bg-dark')};
 const label={innerText:'Hệ thống sẵn sàng',classList:list()};
 const icon={classList:list('ph-check-circle','text-success')};
 const overlay={classList:list('hidden','opacity-0')};
 const nodes={statusBar:bar,statusMessage:label,statusIcon:icon,
   loadingOverlay:overlay,loadingText:{innerText:''}};
 const jobs=new Map();let serial=0;
 const ctx=vm.createContext({
  document:{getElementById:key=>nodes[key]},
  setTimeout:(callback,ms)=>{const id=++serial;jobs.set(id,{callback,ms});return id},
  clearTimeout:(id)=>jobs.delete(id)
 });
 const start=runtime.indexOf('let statusNoticeResetTimer = null;');
 const end=runtime.indexOf('const SheetDB = {',start);
 assert.ok(start>=0&&end>start,'runtime status owner exists');
 vm.runInContext(runtime.slice(start,end),ctx);
 const fire=()=>{
  const entries=[...jobs.entries()];
  for(const [id,v] of entries){jobs.delete(id);v.callback();}
 };
 return {ctx,bar,label,icon,overlay,jobs,fire};
}

test('idle footer is policy, toast temporarily replaces it then returns to policy',()=>{
 const h=toastHarness();
 h.ctx.showToast('Đã cập nhật đơn thành công!','success');
 assert.equal(h.bar.dataset.statusView,'notice');
 assert.equal(h.label.innerText,'Đã cập nhật đơn thành công!');
 assert.equal([...h.jobs.values()][0].ms,3000);
 h.fire();
 assert.equal(h.bar.dataset.statusView,'policy');
 assert.equal(h.bar.classList.contains('bg-dark'),true);
});

test('consecutive notices cannot be erased by a prior reset timer',()=>{
 const h=toastHarness();
 h.ctx.showToast('Đơn đã lưu','success');
 const oldTimer=[...h.jobs.keys()][0];
 h.ctx.showToast('Công nợ chưa lưu','warning');
 assert.equal(h.jobs.has(oldTimer),false,'first timer must be cancelled');
 assert.equal(h.bar.dataset.statusView,'notice');
 assert.equal(h.bar.classList.contains('bg-warning'),true);
 assert.equal([...h.jobs.values()][0].ms,6000,'warning must persist longer');
 h.fire();
 assert.equal(h.bar.dataset.statusView,'policy');
});

test('loading state stays in same bar; completion does not cancel a success toast',()=>{
 const h=toastHarness();
 h.ctx.showLoading('Đang cập nhật đơn hàng…');
 assert.equal(h.bar.dataset.statusView,'loading');
 h.ctx.showToast('Đã cập nhật đơn thành công!');
 h.ctx.hideLoading();
 assert.equal(h.bar.dataset.statusView,'notice','hideLoading must not hide success');
 h.fire();
 assert.equal(h.bar.dataset.statusView,'policy');
});

test('legacy status-only footer still works if no policy module is mounted',()=>{
 const h=toastHarness(false);
 h.ctx.showToast('Đã lưu đơn');
 h.fire();
 assert.equal(h.bar.dataset.statusView,'status');
 assert.equal(h.label.innerText,'Hệ thống sẵn sàng');
});

function policyHarness(pathname='/',publicMode=false){
 const body={children:[],appendChild(el){this.children.push(el);el.parent=this}};
 const bar={dataset:publicMode?{publicUserTools:'true'}:{},children:[],
  appendChild(el){this.children.push(el);el.parent=this}};
 const hero={children:[],appendChild(el){this.children.push(el);el.parent=this}};
 const element=()=>{
  const listeners={};
  return {className:'',hidden:false,children:[],style:{},listeners,
   classList:{add(){},remove(){},contains(){return false}},
   addEventListener:(name,fn)=>{listeners[name]=fn},
   appendChild(child){this.children.push(child);child.parent=this},
   setAttribute(){},focus(){},querySelector(selector){return this.parts?.[selector]??null},
   scrollTop:0};
 };
 const doc={body,documentElement:{style:{overflow:''}},activeElement:body,
   readyState:'complete',
   createElement:()=>element(),
   getElementById:id=>id==='statusBar'?bar:null,
   querySelector:selector=>selector.includes('.hero')?hero:null,
   contains:()=>true};
 const win={location:{pathname},sessionStorage:{getItem:()=>null,setItem(){}}};
 // HTML itself is retained in the overlay source; the fake DOM only wires
 // its existing focus/click controls and does not synthesize a second button.
 body.appendChild=el=>{
  body.children.push(el);el.parent=body;
  if(el.id==='tp-policy-overlay'){
   const dialog=element();const area=element();const close=element();const continueBtn=element();
   el.parts={'.tp-policy-dialog':dialog,'.tp-policy-content':area,
    '.tp-policy-close':close,'.tp-policy-continue':continueBtn};
  }
 };
 vm.runInNewContext(policy,{window:win,document:doc});
 const opener=[...bar.children,...body.children,...hero.children]
  .find(e=>String(e.className).includes('tp-policy-reopen'));
 const popup=body.children.find(e=>e.id==='tp-policy-overlay');
 return {bar,body,hero,opener,popup};
}

test('sales policy is a single accessible click target INSIDE the fixed status bar',()=>{
 const {bar,body,opener,popup}=policyHarness('/');
 assert.ok(opener,'existing policy opener');
 assert.equal(opener.parent,bar);
 assert.equal(bar.dataset.policyInline,'true');
 assert.equal(bar.dataset.statusView,'policy');
 assert.ok(!body.children.includes(opener),'no floating duplicate');
 opener.listeners.click();
 assert.equal(popup.hidden,false,'tap opens the existing policy dialog');
});

test('quote page and public-link tools keep their own independent policy placement',()=>{
 const quote=policyHarness('/bao-gia/');
 assert.equal(quote.opener.parent,quote.hero);
 assert.equal(quote.bar.dataset.policyInline,undefined);
 const pub=policyHarness('/',true);
 assert.equal(pub.opener.parent,pub.body);
 assert.equal(pub.bar.dataset.policyInline,undefined);
 assert.match(publicTools,/inlinePolicy\.classList\.remove\('tp-policy-reopen--bar'\)/);
 assert.match(publicTools,/document\.body\.appendChild\(inlinePolicy\)/);
});

test('policy, messages and progress use the SAME 40px footer with explicit states',()=>{
 assert.match(style,/#statusBar\[data-policy-inline="true"\]:not\(\[data-public-user-tools="true"\]\)/);
 assert.match(style,/height:40px/);
 assert.match(style,/#statusBar\[data-status-view="notice"\] > \.tp-policy-reopen--bar/);
 assert.match(style,/#statusBar\[data-status-view="policy"\] > #statusMessage/);
 assert.match(shell,/customer-policy-notice\.js\?v=20261021-ui185/);
 assert.match(shell,/footer-ui185=20261021/);
});
