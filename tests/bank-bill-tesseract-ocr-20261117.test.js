import test from 'node:test';
import assert from 'node:assert/strict';
import {createBankBillTesseractReader} from '../src/bank-bill-tesseract-ocr.js';

test('number and datetime regions use separate OCR whitelists, normalize confidence',async()=>{
 const events=[];
 const worker={
  async setParameters(p){events.push(['profile',p.tessedit_pageseg_mode,p.tessedit_char_whitelist]);},
  async recognize(b){events.push(['read',b.size]);return{data:{text:' 70.000đ ',confidence:91.5}}},
  async terminate(){events.push(['close'])}
 };
 const engine=createBankBillTesseractReader(worker);
 const got=await engine.readOcr({field:'amount',crop:new Blob(['pixel'])});
 assert.deepEqual(got,{text:'70.000đ',confidence:0.915,source:'local-tesseract-region'});
 const other=await engine.readOcr({field:'transactionTime',crop:new Blob(['pixel'])});
 assert.equal(other.text,'70.000đ');
 assert.ok(events[0][2].includes('0123456789'));
 assert.ok(events[2][2].includes('/:'));
 assert.equal(events[0][1],'7');
 await engine.close();
 assert.equal(events.at(-1)[0],'close');
 await assert.rejects(engine.readOcr({field:'amount',crop:new Blob(['pixels'])}),/ocr_worker_closed/);
});
test('read calls serialize per-field OCR profiles to avoid mixed whitelists',async()=>{
 const trace=[];
 const worker={
   async setParameters(profile){trace.push('set:'+profile.tessedit_char_whitelist.length);},
   async recognize(){trace.push('recognize:start');await Promise.resolve();trace.push('recognize:done');return{data:{text:'ABC',confidence:100}}},
   async terminate(){}
 };
 const engine=createBankBillTesseractReader(worker);
 const outcomes=await Promise.all([
   engine.readOcr({field:'account',crop:new Blob(['a'])}),
   engine.readOcr({field:'recipientName',crop:new Blob(['b'])})
 ]);
 assert.deepEqual(trace,['set:14','recognize:start','recognize:done',
   'set:0','recognize:start','recognize:done']);
 assert.equal(outcomes[0].confidence,1);
 await engine.close();
});
test('bad crop, unknown field and nonlocal worker fail closed',async()=>{
 assert.throws(()=>createBankBillTesseractReader({recognize(){}}),/initialized_local_ocr_worker_required/);
 const engine=createBankBillTesseractReader({async setParameters(){},
   async recognize(){return{data:{text:'x',confidence:Infinity}}}});
 await assert.rejects(engine.readOcr({field:'account',crop:new Blob([])}),/invalid_crop_size/);
 await assert.rejects(engine.readOcr({field:'fake',crop:new Blob(['x'])}),/unknown_region/);
 const got=await engine.readOcr({field:'account',crop:new Blob(['x'])});
 assert.equal(got.confidence,0);
 assert.equal(got.source,'local-tesseract-region');
 await engine.close();
});
