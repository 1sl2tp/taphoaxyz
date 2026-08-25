import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessService} from '../src/core/business.js';

function fakeService(){
  const calls=[];
  const gateway={rpc:async(name,args)=>{calls.push([name,args]);return {name,args};}};
  return {service:createBusinessService({gateway,idFactory:()=>"cmd-1"}),calls};
}

test('bootstrap routes to app_bootstrap',async()=>{
  const {service,calls}=fakeService();
  await service.bootstrap();
  assert.deepEqual(calls,[['app_bootstrap',{}]]);
});

test('meta routes to app_meta',async()=>{
  const {service,calls}=fakeService();
  await service.meta();
  assert.deepEqual(calls,[['app_meta',{}]]);
});

test('domains deduplicates names and routes to app_domains',async()=>{
  const {service,calls}=fakeService();
  await service.domains(['products','products','debt']);
  assert.deepEqual(calls,[['app_domains',{p_domains:['products','debt']}]]);
});
