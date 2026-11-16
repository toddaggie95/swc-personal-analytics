import test from 'node:test';import assert from 'node:assert/strict';import{checkAccess}from'./check-expanded-access.mjs';
const ref=uid=>({attributes:{uid}}),wrap=x=>({swcapi:{result:x}});
const page=(row,total)=>({entities:{attributes:{start:1,count:row.length,total},entity:row}});
test('expanded check preserves known access and never retries rejected planet detail',async()=>{
 const calls=[];let report;
 const facility={uid:'4:1',owner:ref('20:1'),location:{planet:ref('8:999')}};
 const city={uid:'7:2',owner:ref('20:1'),location:{planet:ref('8:999')}};
 await checkAccess(async e=>{calls.push(e);let x={uid:'7:2'};
  if(e==='character/')x={uid:'1:1',factions:[{value:'The Faerytail Family',...ref('20:1')}]};
  if(e.endsWith('/facilities/owner'))x=page([facility],100);
  if(e.endsWith('/cities/owner'))x=page([city],64);
  return {status:200,body:wrap(x)};
 },r=>{report=r;});
 assert.equal(calls.length,7);assert.equal(report.status,'completed');
 assert.ok(!calls.some(e=>e.startsWith('inventory/planets/')));assert.equal(report.cityCount,64);
});
test('failed existing inventory control stops before additional resource reads',async()=>{
 const calls=[];let report;
 await assert.rejects(checkAccess(async e=>{calls.push(e);return e==='character/'?{status:200,body:wrap({uid:'1:1',factions:[{value:'The Faerytail Family',...ref('20:1')}]})}:{status:401,body:{}};},r=>{report=r;}));
 assert.equal(calls.length,3);assert.equal(report.status,'stopped');
});
