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
  assert.match(shell,/fixed-ui-image-save\.js\?v=ios-preview-no-new-tab-20261017/);
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

test('both detail and cart Lưu delegate one save action to platform-aware helper',async()=>{
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
          assert.equal(blob,png);assert.equal(name,'hoa-don.png');actions.push('download');return true;
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

test('iOS installed PWA Save never navigates to blob URL or opens another website',()=>{
  const operations=[];
  const ctx={
    Blob,
    File:class{
      constructor(chunks,name,opts){this.chunks=chunks;this.name=name;this.type=opts.type;}
    },
    navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15',platform:'iPhone'},
    window:{
      TAPHOA_IOS_SHARE_FALLBACK:{open:(files,opts)=>{
        assert.equal(files.length,1);
        assert.equal(files[0].type,'image/png');
        assert.equal(files[0].name,'congno.png');
        assert.equal(opts.mode,'save');
        operations.push('in-app-preview');
        return true;
      }}
    },
    document:{createElement:()=>{throw Error('must never create download link on iOS');}},
    URL:{createObjectURL:()=>{throw Error('must never navigate to blob: on iOS');}}
  };
  vm.runInNewContext(helper,ctx);
  const result=ctx.window.TAPHOA_IMAGE_SAVE.savePng(new Blob(['png'],{type:'image/png'}),'congno.png');
  assert.equal(result,'preview');
  assert.deepEqual(operations,['in-app-preview']);
});

test('iOS share preview Save mode blocks second blob download and shows honest Photos steps',()=>{
  const fallback=fs.readFileSync('src/fixed-ui-ios-share-fallback.js','utf8');
  assert.match(fallback,/options\.mode==='save'/);
  assert.match(fallback,/Nhấn giữ ảnh → chọn Lưu vào Ảnh/);
  assert.match(fallback,/saveBtn\.style\.display=saveMode\?'none':'block'/);
  assert.match(fallback,/host\?\.dataset\?\.saveMode==='true'/);
  assert.match(cart,/mode!=='preview'/);
  assert.match(debt,/mode!=='preview'/);
});

test('debt Save and order Save never label downloads as already saved',()=>{
  assert.match(debt,/saver\(blob,'congno.png'\)/);
  assert.match(debt,/Đã yêu cầu tải ảnh công nợ/);
  assert.match(cart,/Đã yêu cầu tải ảnh xuống thiết bị/);
  assert.doesNotMatch(debt.slice(debt.indexOf("if (action === 'save')"),
    debt.indexOf("const file = new File",debt.indexOf("if (action === 'save')"))),
    /fallback\.open|navigator\.share/);
});
