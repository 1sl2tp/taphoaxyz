import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/fixed-ui-source-1.css',import.meta.url),'utf8');
const script=html.split('<script id="taphoa-pwa-viewport-policy">')[1]?.split('</script>')[0];
assert.ok(script,'P0 policy must run synchronously in the HTML head');
assert.ok(html.indexOf('taphoa-pwa-viewport-policy')<html.indexOf('fixed-pwa-auto-update.js'));
assert.ok(css.includes('html[data-taphoa-standalone="true"] #appContainer{'));
assert.ok(css.includes('touch-action:pan-x pan-y;'));

function runPolicy({displayMode=false,iosStandalone=false}={}){
  const handlers=new Map();
  const viewport={content:'width=device-width, initial-scale=1.0, viewport-fit=cover'};
  const document={
    documentElement:{dataset:{}},
    querySelector:sel=>sel==='meta[name="viewport"]'?viewport:null,
    addEventListener(type,handler,options){handlers.set(type,{handler,options});}
  };
  const window={matchMedia:()=>({matches:displayMode})};
  const navigator={standalone:iosStandalone};
  vm.runInNewContext(script,{document,window,navigator});
  return{handlers,viewport,document};
}

test('normal browser retains accessible zoom and has no global gesture interception',()=>{
  const result=runPolicy();
  assert.equal(result.handlers.size,0);
  assert.equal(result.viewport.content,'width=device-width, initial-scale=1.0, viewport-fit=cover');
  assert.equal(result.document.documentElement.dataset.taphoaStandalone,undefined);
});

test('installed PWA limits shell zoom but preserves native pan and external image preview',()=>{
  for(const standalone of [{displayMode:true},{iosStandalone:true}]){
    const {handlers,viewport,document}=runPolicy(standalone);
    assert.equal(document.documentElement.dataset.taphoaStandalone,'true');
    assert.match(viewport.content,/maximum-scale=1, user-scalable=no/);
    assert.equal(handlers.size,2);
    const app={closest:sel=>sel==='#appContainer'?{}:null};
    const outside={closest:()=>null};
    for(const {handler,options} of handlers.values()){
      assert.equal(options.passive,false);
      let blocked=0;
      handler({cancelable:true,target:app,preventDefault(){blocked++;}});
      assert.equal(blocked,1,'app shell pinch must be stopped');
      handler({cancelable:true,target:outside,preventDefault(){blocked++;}});
      handler({cancelable:false,target:app,preventDefault(){blocked++;}});
      assert.equal(blocked,1,'outside share viewer and noncancelable gestures remain untouched');
    }
  }
});
