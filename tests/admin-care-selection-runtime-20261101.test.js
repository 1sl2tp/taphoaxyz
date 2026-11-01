import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/admin-customer-care-report.js',import.meta.url),'utf8');
const start=source.indexOf('  function render(){');
const end=source.indexOf('\n  async function load(force=false){',start);
assert.ok(start>=0&&end>start);
const renderSource=source.slice(start,end);
function fixture(items,initialSelection,filter='all'){
  const table={records:[],replaceChildren(){this.records=[];},insertRow(){
    const record={className:'',cells:[],insertCell(){
      const cell={colSpan:1,textContent:'',append(child){this.button=child;}};
      record.cells.push(cell);return cell;
    }};
    this.records.push(record);return record;
  }};
  const elems={
    careSearch:{value:''},careFilter:{value:filter},careCount:{textContent:''},careBody:table
  };
  const state={rows:items,selected:initialSelection,elems,selectedDetail:null};
  const context=vm.createContext({state});
  vm.runInContext(`
    let rows=state.rows,selected=state.selected;
    const $=id=>state.elems[id];
    const number=v=>String(v??0),amount=number,percent=number;
    const group=r=>r.segment||'Khách';
    const address=r=>({name:r.name});
    const elapsed=()=>7;
    const document={createElement:()=>({type:'',dataset:{},textContent:''})};
    const detail=r=>{state.selectedDetail=r;};
    ${renderSource}
    globalThis.run=()=>{render();state.selected=selected;};
  `,context);
  return {table,state,run:context.run};
}
test('report initially highlights the first customer when there is no selection',()=>{
  const a={id:20,name:'A'},b={id:21,name:'B'};
  const f=fixture([a,b],'');
  f.run();
  assert.equal(f.table.records[0].className,'active');
  assert.equal(f.table.records[1].className,'');
  assert.equal(f.state.selectedDetail,a);
});
test('report accepts numeric RPC IDs selected via string DOM data attributes',()=>{
  const a={id:20,name:'A'},b={id:21,name:'B'};
  const f=fixture([a,b],'21');
  f.run();
  assert.equal(f.table.records[1].className,'active');
  assert.equal(f.state.selectedDetail,b);
});
test('report source rejects late failures from prior account or period',()=>{
  assert.match(source,/if\(generation!==requestGeneration\|\|getIdentity\(\)\?\.uid!==identity\.uid\|\|reloadQueued\)return;\s*\$\('careStatus'\)\.textContent='Không tải/);
  assert.match(source,/if\(generation!==requestGeneration\|\|getIdentity\(\)\?\.uid!==identity\.uid\|\|reloadQueued\)return;[\s\S]{0,450}if\(voiceSetting/);
});
