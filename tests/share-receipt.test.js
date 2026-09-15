import test from 'node:test';
import assert from 'node:assert/strict';

import {shareReceiptImage} from '../src/core/share-receipt.js';

test('shareReceiptImage prefers native file sharing when available',async()=>{
  const calls=[];
  const canvas={toBlob:cb=>cb(new Blob(['x'],{type:'image/jpeg'}),'image/jpeg',.9)};
  const result=await shareReceiptImage({id:'receipt'},
    {fileName:'don-1.jpg',title:'Đơn 1',text:'taphoa.xyz'},
    {html2canvas:async()=>canvas,navigator:{canShare:()=>true,share:async payload=>calls.push(payload)},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},document:{createElement:()=>({click(){}})}});
  assert.equal(result.shared,true);
  assert.equal(result.downloaded,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].files[0].name,'don-1.jpg');
});

test('shareReceiptImage falls back to an image link when file sharing is unavailable',async()=>{
  let clicked=false;
  const canvas={toBlob:cb=>cb(new Blob(['x'],{type:'image/jpeg'}),'image/jpeg',.9)};
  const result=await shareReceiptImage({id:'receipt'},
    {fileName:'don-2.jpg',title:'Đơn 2',text:'taphoa.xyz'},
    {html2canvas:async()=>canvas,navigator:{},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},document:{createElement:()=>({href:'',download:'',click(){clicked=true;}})}});
  assert.equal(result.shared,false);
  assert.equal(result.downloaded,true);
  assert.equal(clicked,true);
});
