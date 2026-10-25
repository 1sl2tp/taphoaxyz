import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const src=readFileSync(new URL('../src/fixed-ui-debt-pagination.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../src/fixed-production-bridge.js',import.meta.url),'utf8');
const overrides=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
const renderer=readFileSync(new URL('../src/fixed-ui-behavior.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/fixed-ui-source-1.css',import.meta.url),'utf8');

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const handlers=new Map();
  function element(tag='div'){
    const node={
      tagName:tag.toUpperCase(),children:[],dataset:{},hidden:false,disabled:false,
      id:'',className:'',textContent:'',scrollTop:1730,
      scrollHeight:2600,clientHeight:600,
      append(...elements){this.children.push(...elements);},
      appendChild(child){this.children.push(child);return child;},
      addEventListener(event,cb){handlers.set(this===list?event:'click:'+this.id,cb);},
      querySelector(selector){
        const id=selector.slice(1);
        const find=node=>node.children.find(child=>child.id===id || find(child));
        return find(this)||null;
      }
    };
    return node;
  }
  const list=element();list.id='cDebtModalHistoryList';
  const modal=element();modal.id='customerDebtModalWrapper';
  modal.classList={contains:()=>false};
  const document={
    getElementById(id){return {'cDebtModalHistoryList':list,'customerDebtModalWrapper':modal}[id]||null;},
    createElement:element
  };
  const full=Array.from({length:161},(_,i)=>{
    const id=161-i;
    return {id,ngay:new Date(Date.UTC(2026,9,20,0,id,0)).toISOString(),movement:id%2?10:-10};
  });
  const requests=[], rendered=[];
  let account='sam';
  let pending=null;
  const window={
    TAPHOA_DEBT_PAGE_STATE:null,
    TAPHOA_PRODUCTION:{
      async debtLedger(customer,opts){
        requests.push({customer,...opts});
        if(pending){
          const d=pending;pending=null;
          return d.promise;
        }
        const index=opts.beforeId===undefined?0:full.findIndex(row=>String(row.id)===String(opts.beforeId))+1;
        return {transactions:full.slice(index,index+opts.limit)};
      },
      ledgerToRows(detail){return detail.transactions.map(tx=>
        [tx.id,account,'Thu tiền',tx.movement,tx.ngay,0,'collection']);}
    },
    TAPHOA_RENDER_DEBT_HISTORY_PAGE:id=>rendered.push(id),
    async openCustomerDebtModal(id){
      account=id;
      env.activeDebtCustomerId=id;
      window.TAPHOA_DEBT_PAGE_STATE={
        customerId:id,requestSeq:requests.length+1,
        customer:{id},balance:236,transactions:full.slice(0,50),
        hasMore:true,loading:false,failed:false
      };
      return true;
    }
  };
  const env={
    window,document,console,appData:{thuchi:[['header']]},
    activeDebtCustomerId:'sam',renderCongNo:()=>{},
    setTimeout:fn=>{fn();return 1}
  };
  vm.runInNewContext(src,env,{filename:'fixed-ui-debt-pagination.js'});
  return {env,window,handlers,list,full,requests,rendered,
    setPending(d){pending=d;}};
}

test('scroll near end fetches older keyset pages 50/50/11 without duplicates',async()=>{
  const x=setup();
  await x.window.openCustomerDebtModal('sam');
  assert.equal(x.window.TAPHOA_DEBT_PAGE_CONTROLS.inspect().loaded,50);
  const onscroll=x.handlers.get('scroll');
  assert.equal(typeof onscroll,'function');
  x.list.scrollTop=100;onscroll();await tick();await tick();
  assert.equal(x.requests.length,0,'upward scroll does not fetch historical pages');
  x.list.scrollTop=1900;onscroll();await tick();await tick();
  assert.equal(x.window.TAPHOA_DEBT_PAGE_CONTROLS.inspect().loaded,100);
  assert.equal(x.requests[0].beforeId,'112','cursor uses exact last ID of first page');
  assert.equal(x.list.scrollTop,1900,'scroll anchor kept in place after re-render');
  await x.window.TAPHOA_DEBT_PAGE_CONTROLS.loadOlder();
  await x.window.TAPHOA_DEBT_PAGE_CONTROLS.loadOlder();
  const s=x.window.TAPHOA_DEBT_PAGE_CONTROLS.inspect();
  assert.equal(s.loaded,161);
  assert.equal(s.hasMore,false);
  const ids=x.window.TAPHOA_DEBT_PAGE_STATE.transactions.map(r=>r.id);
  assert.equal(new Set(ids).size,161);
  assert.equal(x.requests.length,3);
  assert.deepEqual(x.requests.map(r=>r.beforeId),['112','62','12']);
  assert.equal(x.rendered.length,3);
  assert.equal(x.window.TAPHOA_DEBT_PAGE_CONTROLS.inspect().loading,false);
});

test('switching customers while an old request is unresolved cannot append to new customer',async()=>{
  const x=setup();
  await x.window.openCustomerDebtModal('sam');
  let resolve;
  x.setPending({promise:new Promise(res=>{resolve=res;})});
  const prior=x.window.TAPHOA_DEBT_PAGE_CONTROLS.loadOlder();
  await x.window.openCustomerDebtModal('another-customer');
  resolve({transactions:x.full.slice(50,100)});
  await prior;
  assert.equal(x.window.TAPHOA_DEBT_PAGE_STATE.customerId,'another-customer');
  assert.equal(x.window.TAPHOA_DEBT_PAGE_CONTROLS.inspect().loaded,50);
  assert.equal(x.rendered.length,0);
  await x.window.TAPHOA_DEBT_PAGE_CONTROLS.loadOlder();
  assert.equal(x.window.TAPHOA_DEBT_PAGE_CONTROLS.inspect().loaded,100,
    'other customer can independently load even after a stale request');
});

test('existing scroll owners retain non-debt lists; index loads pager after cycles',()=>{
  assert.match(css,/#tab-ban-hang\s*>\s*main,[\s\S]*?#cDebtModalHistoryList\s*\{[\s\S]*?overflow-y:auto\s*!important/);
  assert.match(html,/fixed-ui-debt-cycles\.js[^\n]*\n\s*<script src="\.\/src\/fixed-ui-debt-pagination\.js/);
  assert.match(overrides,/window\.TAPHOA_DEBT_PAGE_STATE=/);
  assert.match(overrides,/requestSeq!==debtModalOpenSeq/);
  assert.match(bridge,/async function debtLedger\(customerId,\{beforeAt=null,beforeId=null,limit=50\}=\{\}\)/);
  assert.match(bridge,/business\.debtLedger\(customerId,\{beforeAt,beforeId,limit:pageLimit\}\)/);
  assert.match(renderer,/window\.TAPHOA_RENDER_DEBT_HISTORY_PAGE/);
  assert.match(renderer,/historyList\.scrollTop=previousScroll/);
  assert.doesNotMatch(src,/debtTransaction\(|saveOrder\(|collection\(/,
    'history reader must never write ledger money');
});
