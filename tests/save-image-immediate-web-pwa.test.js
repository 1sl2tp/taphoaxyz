import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const shell=fs.readFileSync('index.html','utf8');
const helper=fs.readFileSync('src/fixed-ui-image-save.js','utf8');
const cart=fs.readFileSync('src/fixed-ui-cart-share-v3.js','utf8');
const debt=fs.readFileSync('src/fixed-ui-runtime-12.js','utf8');

function saveFunction(source,name,next){
  const start=source.indexOf('async function '+name+'(');
  const end=source.indexOf('async function '+next+'(',start);
  assert.ok(start>=0&&end>start, 'Cannot locate '+name);
  return vm.runInNewContext('('+source.slice(start,end).trim()+')');
}

test('single shared PNG download does not show any chooser, Web Share or preview',()=>{
  assert.match(shell,/fixed-ui-image-save\.js\?v=download-one-png-20261017/);
  assert.ok(shell.indexOf('fixed-ui-image-save.js')<shell.indexOf('fixed-ui-runtime-12.js'));
  assert.ok(shell.indexOf('fixed-ui-image-save.js')<shell.indexOf('fixed-ui-cart-share-v3.js'));
  const actions=[];
  const anchor={click(){actions.push('download')},remove(){actions.push('remove')},style:{}};
  const ctx={
    window:{},
    Blob,
    URL:{
      createObjectURL:()=>{actions.push('create');return 'blob:one-png';},
      revokeObjectURL:()=>actions.push('revoke')
    },
    document:{
      createElement:tag=>{assert.equal(tag,'a');return anchor},
      body:{appendChild:()=>actions.push('append')}
    },
    setTimeout:callback=>{actions.push('scheduled');callback()}
  };
  vm.runInNewContext(helper,ctx);
  const blob=new Blob(['png'],{type:'image/png'});
  assert.equal(ctx.window.TAPHOA_IMAGE_SAVE.savePng(blob,'congno.png'),true);
  assert.equal(anchor.download,'congno.png');
  assert.equal(anchor.href,'blob:one-png');
  assert.deepEqual(actions,['create','append','download','remove','scheduled','revoke']);
});

test('both detail and cart Lưu trigger exactly one download in iPhone PWA',async()=>{
  const lines=[
    ['saveDetailOrderImage','copyDetailOrderImage','prepareDetailShareCache'],
    ['saveCartPng','copyCartPng','cartPngArtifact']
  ];
  for(const [name,next,render] of lines){
    const source=cart.slice(cart.indexOf('async function '+name+'('),
      cart.indexOf('async function '+next+'(',cart.indexOf('async function '+name+'('))).trim();
    assert.doesNotMatch(source,/fallback\.open|navigator\.share|TAPHOA_IOS_SHARE_FALLBACK/);
    const actions=[];
    const png=new Blob(['pixel'],{type:'image/png'});
    const context={
      window:{
        TAPHOA_IMAGE_SAVE:{savePng:(blob,name)=>{
          assert.equal(blob,png);assert.equal(name,'hoa-don.png');actions.push('download');
        }},
        TAPHOA_IOS_SHARE_FALLBACK:{shouldUse:()=>true,open:()=>{throw Error('preview')}}
      },
      showToast:()=>actions.push('toast'),
      [render]:async()=>({blob:png,fileName:'hoa-don.png'})
    };
    const save=vm.runInNewContext('('+source+')',context);
    await save();
    assert.deepEqual(actions,['download','toast']);
  }
});

test('debt Save and order Save never label downloads as already saved',()=>{
  assert.match(debt,/saver\(blob,'congno.png'\)/);
  assert.match(debt,/Đã yêu cầu tải ảnh công nợ/);
  assert.match(cart,/Đã yêu cầu tải ảnh xuống thiết bị/);
  assert.doesNotMatch(debt.slice(debt.indexOf("if (action === 'save')"),
    debt.indexOf("const file = new File",debt.indexOf("if (action === 'save')"))),
    /fallback\.open|navigator\.share/);
});
