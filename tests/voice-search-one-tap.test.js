import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const script=read('src/fixed-ui-no-hints.js');
const begin=script.indexOf('  let voiceSession=null;');
const end=script.indexOf('  const voiceCss=',begin);
assert.ok(begin>0&&end>begin);
const code=script.slice(begin,end)+'\n globalThis.startVoiceSession=startVoiceSession; globalThis.abortVoiceSession=abortVoiceSession;';
function setup(){
  let instance;
  class Recognition{
    constructor(){instance=this;this.stopCount=0;this.abortCount=0}
    start(){this.started=true}
    stop(){this.stopCount++}
    abort(){this.abortCount++}
  }
  const events=[];
  const input={disabled:false,readOnly:false,isConnected:true,value:'old search',dataset:{},
    dispatchEvent(event){events.push({type:event.type,value:this.value,ready:this.dataset.taphoaVoiceReady})}};
  const button={attributes:{},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}};
  const window={SpeechRecognition:Recognition,alert:msg=>{throw new Error(msg)}};
  const context={window,document:{},Event:class{constructor(type,options){this.type=type;this.bubbles=options.bubbles}},
    Array,String,Number,Element:class {},Error,Map,Object};
  vm.runInNewContext(code,context);
  context.startVoiceSession(input,button);
  return {context,input,button,events,get recognition(){return instance}};
}
function speech(text,isFinal){
  return {0:{transcript:text},isFinal};
}
test('one tap interim shows words immediately, first final searches exactly once',()=>{
  const x=setup();assert.equal(x.recognition.started,true);
  assert.equal(x.recognition.interimResults,true);
  x.recognition.onresult({results:[speech('sữa chua',false)]});
  assert.equal(x.input.value,'sữa chua');
  assert.equal(x.events.length,0);
  x.recognition.onresult({results:[speech('sữa chua không đường',true)]});
  assert.equal(x.events.length,1);assert.equal(x.events[0].value,'sữa chua không đường');
  assert.equal(x.events[0].ready,'1');
  x.recognition.onresult({results:[speech('duplicate',true)]});
  x.recognition.onend();
  assert.equal(x.events.length,1);
  assert.equal(x.input.dataset.taphoaVoiceReady,undefined);
});
test('interim-only browser end falls back to one automatic search',()=>{
  const x=setup();
  x.recognition.onresult({results:[speech('sữa bột',false)]});
  x.recognition.onspeechend();
  assert.equal(x.recognition.stopCount,1);
  x.recognition.onend();
  assert.equal(x.events.length,1);
  assert.equal(x.input.value,'sữa bột');
});
test('cancel reverts preview without searching',()=>{
  const x=setup();
  x.recognition.onresult({results:[speech('tạm',false)]});
  x.context.abortVoiceSession();
  assert.equal(x.input.value,'old search');
  assert.equal(x.events.length,0);
  assert.equal(x.recognition.abortCount,1);
});
test('sales market search bypasses 180ms debounce only for voice final',()=>{
  const r=read('src/fixed-ui-runtime-4.js');
  assert.match(r,/voiceReady \? 0 : 180/);
  assert.match(r,/input\?\.dataset\.taphoaVoiceReady/);
  for(const path of ['index.html','admin-gia.html','bao-gia/index.html','ncc/index.html','kh/index.html']){
    assert.match(read(path),/voice-one-tap=20261009/);
  }
});
