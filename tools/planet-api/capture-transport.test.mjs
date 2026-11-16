import test from 'node:test';import assert from 'node:assert/strict';
import{captureEndpoint,makeCaptureTransport,newPacer}from'./capture-transport.mjs';
const pacer={async beforeRequest(){},afterResponse(){},summary(){return {};}};
test('capture transport permits only bounded planning GET resource paths',()=>{
 for(const path of ['inventory/planets/8:1','messages/','https://example.com/','galaxy/planets/../','inventory/cities/7:1/rename'])assert.equal(captureEndpoint(path),false);
 for(const path of ['character/','inventory/20:1/facilities/owner','inventory/cities/7:1','types/facilities/4:1'])assert.equal(captureEndpoint(path),true);
});
test('request limit and encrypted-save callback apply before an additional fetch',async()=>{
 let calls=0;const saved=[];const t=makeCaptureTransport({auth:{accessToken:async()=> 'test-access'},pacer,save:async(n,v)=>saved.push({n,v}),phase:'test',limit:1,deadline:Date.now()+60000,
  fetcher:async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.redirect,'error');return new Response('{"swcapi":{"uid":"1:1"}}',{status:200});}});
 await t.read('character/');await assert.rejects(t.read('character/'));
 assert.equal(calls,1);assert.equal(saved.length,1);assert.ok(!JSON.stringify(saved).includes('test-access'));
 assert.match(saved[0].v.source.sha256,/^[a-f0-9]{64}$/);
});
test('oversized responses stop rather than buffering arbitrary payloads',async()=>{
 const t=makeCaptureTransport({auth:{accessToken:async()=> 'test'},pacer,save:async()=>{},phase:'test',limit:1,deadline:Date.now()+60000,
  fetcher:async()=>new Response(new Uint8Array(8*1024*1024+1))});
 await assert.rejects(t.read('character/'),/response-size/);
});
test('production pacing implementation loads without OAuth or third-party runtime dependencies',async()=>{
 const p=await newPacer(Date.now()+60000);assert.equal(typeof p.beforeRequest,'function');assert.equal(typeof p.summary,'function');
});
