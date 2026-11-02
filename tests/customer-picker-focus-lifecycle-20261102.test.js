import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../src/fixed-ui-runtime-6.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=src.indexOf('let customerPickerFocusToken = 0;');
const end=src.indexOf('async function submitNewCustomer(event)',start);
assert(start>0&&end>start,'customer picker focus owner exists');
const code=src.slice(start,end);

function fixture(){
  const raf=[];
  let active=null;
  function node(initial=[],extra={}){
    const values=new Set(initial);
    return{
      classList:{
        add(...items){items.forEach(item=>values.add(item));},
        remove(...items){items.forEach(item=>values.delete(item));},
        contains(item){return values.has(item);},
        toggle(item,value){if(value)values.add(item);else values.delete(item);}
      },
      isConnected:true, value:'',textContent:'', ...extra
    };
  }
  let searchFocus=0,formFocus=0,blurred=0;
  const search=node([],{focus(){searchFocus++;active=search;}});
  const input=node([],{focus(){formFocus++;active=input;},select(){}});
  const modal=node(['opacity-0','pointer-events-none'],{contains(el){return el===search||el===input;}});
  const items={
    customerSearchInput:search,customerModal:modal,
    customerBox:node(['scale-95']),newCustomerButton:node(['hidden']),
    newCustomerForm:node(['hidden']),newCustomerName:input,
    newCustomerSaveButton:node(),newCustomerError:node(['hidden'])
  };
  search.blur=()=>{blurred++;if(active===search)active=null;};
  input.blur=()=>{blurred++;if(active===input)active=null;};
  const ctx={document:{
    getElementById:id=>items[id]||null,
    get activeElement(){return active;}
  },requestAnimationFrame:cb=>raf.push(cb),
  currentAuthRole:'admin',customerSelectionContext:'sale',
  renderCustomerList(){},renderCartFooterActions(){},syncUserSelfCustomer(){}};
  vm.runInNewContext(code+'\nthis.actions={open:openCustomerModal,close:closeCustomerModal,openForm:openNewCustomerForm,closeForm:closeNewCustomerForm};',ctx);
  return{actions:ctx.actions,raf,flush(){while(raf.length)raf.shift()();},
    search,input,modal,items,
    stats:()=>({searchFocus,formFocus,blurred,active})
  };
}

test('close while focus retry is queued never summons keyboard on hidden customer picker',()=>{
  const f=fixture();
  f.actions.open();
  assert.equal(f.stats().searchFocus,1);
  f.actions.close();
  assert.equal(f.stats().blurred,1);
  f.flush();
  assert.equal(f.stats().searchFocus,1);
  assert.equal(f.stats().active,null);
  assert.equal(f.modal.classList.contains('opacity-0'),true);
});

test('switch to new customer form supersedes queued search focus',()=>{
  const f=fixture();
  f.actions.open();
  f.actions.openForm();
  f.flush();
  assert.equal(f.stats().searchFocus,1);
  assert.equal(f.stats().formFocus,1);
  assert.equal(f.stats().active,f.input);
});

test('close new customer form and dialog before a queued focus prevents stale form focus',()=>{
  const f=fixture();
  f.actions.open();
  f.actions.openForm();
  f.actions.closeForm({focusSearch:true});
  f.actions.close();
  f.flush();
  assert.equal(f.stats().formFocus,0);
  assert.equal(f.stats().searchFocus,1);
  assert.equal(f.stats().active,null);
});

test('closing new form while modal is visible returns focus to search',()=>{
  const f=fixture();
  f.actions.open();
  f.actions.openForm();
  f.actions.closeForm({focusSearch:true});
  f.flush();
  assert.equal(f.stats().formFocus,0);
  assert.equal(f.stats().searchFocus,2);
  assert.equal(f.stats().active,f.search);
});

test('runtime asset gets a new revision without changing order data',()=>{
  assert.ok(html.includes('customer-picker-focus=20261102'));
  assert.ok(code.includes('focusToken!==customerPickerFocusToken'));
});
