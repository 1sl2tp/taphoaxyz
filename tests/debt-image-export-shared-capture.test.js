import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync('src/fixed-ui-runtime-12.js','utf8');
function sourceOf(name,next){
  const begin=code.indexOf('async function '+name+'(');
  const end=code.indexOf('async function '+next+'(',begin);
  assert.ok(begin>=0&&end>begin,'Unable to find '+name);
  return code.slice(begin,end).trim();
}
const generator=sourceOf('createCustomerDebtPngBlob','shareCustomerDebtImage');
const saveShare=code.slice(code.indexOf('async function shareCustomerDebtImage('),
  code.indexOf('function requestClearSheet(sheetName)')).trim();

test('debt image lazy-loads through the same helper as order images',async()=>{
  assert.match(generator,/window\.TAPHOA_SHARE_CAPTURE/);
  assert.match(generator,/capture\.captureElement\(clone/);
  assert.match(generator,/capture\.canvasToPngBlob\(canvas/);
  assert.doesNotMatch(generator,/(?:^|[^.\w])html2canvas\s*\(/);
  const actions=[];
  const canvas={width:672,height:896};
  const png={size:4803,type:'image/png'};
  const clone={style:{},scrollHeight:640,removeAttribute(){},
    querySelector(){return null;}};
  const host={style:{},setAttribute(){},appendChild(){},remove(){actions.push('remove');}};
  const capture={
    captureElement:async(target,opts)=>{
      assert.equal(target,clone);
      assert.equal(opts.width,460);
      assert.equal(opts.height,644);
      assert.ok(opts.libraryTimeout>0&&opts.renderTimeout>0);
      actions.push('capture');
      return canvas;
    },
    canvasToPngBlob:async(value)=>{
      assert.equal(value,canvas);
      actions.push('png');
      return png;
    }
  };
  const context={
    window:{TAPHOA_SHARE_CAPTURE:capture},
    document:{
      getElementById:id=>id==='customerDebtContentToShare'
        ?{getBoundingClientRect:()=>({width:460}),cloneNode:()=>clone}
        :{innerText:''},
      createElement:()=>host,
      body:{appendChild:()=>actions.push('host')}
    },
    requestAnimationFrame:cb=>cb(),
    showLoading:()=>actions.push('loading'),
    hideLoading:()=>actions.push('hide')
  };
  const create=vm.runInNewContext('('+generator+')',context);
  assert.equal(await create(),png);
  assert.deepEqual(actions,['loading','host','capture','png','remove','hide']);
});

test('debt Save exports one generated PNG without opening the OS text share sheet',async()=>{
  const actions=[];
  const png={size:42,type:'image/png'};
  let savedFile;
  const context={
    createCustomerDebtPngBlob:async()=>png,
    window:{TAPHOA_IOS_SHARE_FALLBACK:{shouldUse:()=>false}},
    navigator:{share:()=>{throw Error('native share must not be used to save');}},
    File:class{constructor(chunks,name,options){
      savedFile={chunks,name,options};
    }},
    URL:{createObjectURL:()=> 'blob:png',revokeObjectURL:()=>actions.push('revoke')},
    document:{createElement:tag=>{
      assert.equal(tag,'a');
      return {href:'',download:'',click(){actions.push('click');},
        remove(){actions.push('remove');}};
    },body:{appendChild(){actions.push('append');}}},
    setTimeout:callback=>callback(),
    showToast:()=>actions.push('toast'),
    showAlertPopup:(...args)=>{throw Error('unexpected alert '+args)},
  };
  const save=vm.runInNewContext('('+saveShare+')',context);
  await save('save');
  assert.equal(savedFile.name,'congno.png');
  assert.equal(savedFile.chunks.length,1);
  assert.equal(savedFile.chunks[0],png);
  assert.deepEqual(actions,['append','click','remove','revoke','toast']);
});
