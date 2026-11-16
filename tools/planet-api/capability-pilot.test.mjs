import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedEndpoint,collectPilot,collectCityPilot,fieldPaths,validatePage} from './capability-pilot.mjs';

const wrap=v=>({swcapi:{result:v}});
const ref=id=>({attributes:{uid:id}});
const facility={uid:'4:1',owner:ref('20:1'),type:ref('16:1'),location:{planet:ref('8:1')}};
const page=(rows,total=rows.length)=>({entities:{attributes:{total,start:1,count:rows.length},entity:rows}});
async function run(options={}){
 const calls=[];let report;
 const request=async(endpoint,query)=>{
  calls.push({endpoint,query});
  if(options.override){const r=options.override(endpoint);if(r)return r;}
  let data={uid:endpoint.split('/').at(-1),name:'test'};
  if(endpoint==='character/')data={factions:[{value:'Faction',...ref('20:1')}]};
  else if(endpoint.startsWith('galaxy/planets/'))data={uid:'8:1',name:'Planet One',cities:{city:[ref('7:2')]}};
  else if(endpoint.endsWith('/facilities/owner'))data=page([facility],201);
  else if(endpoint==='inventory/facilities/4:1')data={...facility,ispowered:'Yes',facilityincome:{income:123}};
  else if(endpoint.endsWith('/cities/owner'))return {status:403,body:{}};
  return {status:200,body:wrap(data)};
 };
 const promise=collectPilot(request,{planetName:'Planet One',factionName:'Faction',includePlanetInventory:options.includePlanetInventory??true,save:r=>{report=r;}});
 try {await promise;return {calls,report};}catch(error){return {calls,report,error};}
}
test('pilot records partial ownership coverage and unknown generation epoch',async()=>{
 const {report,calls,error}=await run();assert.equal(error,undefined);
 assert.equal(report.status,'completed');assert.equal(report.completePhysicalPlanet,false);
 assert.deepEqual(report.facilityCoverage,{total:201,returned:1,completeOwnedList:false,allOwners:false});
 assert.equal(report.generationTimeKnown,false);
 assert.ok(calls.some(c=>c.endpoint==='galaxy/cities/7:2'));
 assert.equal(calls.filter(c=>c.endpoint.includes('/facilities/owner')).length,1);
 assert.ok(report.resources.find(r=>r.label==='facility_detail').fields.includes('facilityincome.income'));
});
test('denied resources do not provoke repeated endpoint attempts',async()=>{
 const {report,calls}=await run({override:e=>e.endsWith('/facilities/owner')?{status:403,body:{}}:null});
 assert.equal(report.status,'completed');assert.equal(report.facilityCoverage,undefined);
 assert.equal(calls.filter(c=>c.endpoint.startsWith('inventory/')&&c.endpoint.includes('/facilities/')).length,1);
});
test('invalid credentials stop all remaining reads and retain report',async()=>{
 const {report,calls,error}=await run({override:e=>e.startsWith('inventory/planets/')?{status:401,body:{error:'sensitive'}}:null});
 assert.ok(error);assert.equal(report.status,'stopped');assert.equal(calls.length,3);
 assert.ok(!JSON.stringify(report).includes('sensitive'));
});
test('quota exhaustion stops without retry',async()=>{
 const {calls,error}=await run({override:e=>e==='character/'?{status:429,body:{}}:null});
 assert.ok(error);assert.equal(calls.length,1);
});
test('mixed planet and foreign owner responses stop collection',()=>{
 for(const row of [{...facility,owner:ref('20:9')},{...facility,location:{planet:ref('8:9')}}])
  assert.throws(()=>validatePage(page([row]),'8:1','20:1','4'));
});
test('duplicate, inconsistent and premature empty pages cannot imply coverage',()=>{
 for(const p of [page([facility,facility]),page([],3),{entities:{attributes:{total:1,start:2,count:1},entity:[facility]}},page([facility],0)])
  assert.throws(()=>validatePage(p,'8:1','20:1','4'));
});
test('detail identity drift stops the remaining capability reads',async()=>{
 const {error,report,calls}=await run({override:e=>e==='inventory/facilities/4:1'?{status:200,body:wrap({...facility,uid:'4:2'})}:null});
 assert.ok(error);assert.equal(report.status,'stopped');assert.ok(!calls.some(c=>c.endpoint==='types/facilities/'));
});
test('transport allowlist rejects mutations, arbitrary origins and paths',()=>{
 for(const e of ['https://example.com/','character/../oauth/token','inventory/facilities/4:1/rename','galaxy/planets/../','oauth/token'])assert.equal(allowedEndpoint(e),false);
 assert.equal(allowedEndpoint('galaxy/planets/Planet%20One/'),true);
});
test('field evidence preserves zero and false without treating omission as zero',()=>{
 assert.deepEqual(fieldPaths({zero:0,powered:false,rows:[{a:1},{b:2}]}),['powered','rows[].a','rows[].b','zero']);
});
test('an unresolved planet cannot cause a faction-wide inventory request',async()=>{
 const {calls,error}=await run({override:e=>e.startsWith('galaxy/planets/')?{status:200,body:wrap({uid:'8:2',name:'Other'})}:null});
 assert.ok(error);assert.equal(calls.length,2);
});
test('referenced city probe makes one read without repeating inventories',async()=>{
 const calls=[];let report;
 await collectCityPilot(async e=>{calls.push(e);return {status:200,body:wrap({uid:'7:2',layout:'opaque'})};},
  {cityUid:'7:2',save:r=>{report=r;}});
 assert.deepEqual(calls,['galaxy/cities/7:2']);assert.equal(report.status,'completed');
 assert.ok(report.resources[0].fields.includes('layout'));
});
test('restricted private planet detail can be omitted while city and facility discovery continue',async()=>{
 const {calls,report,error}=await run({includePlanetInventory:false,override:e=>e.startsWith('inventory/planets/')?{status:401,body:{}}:null});
 assert.equal(error,undefined);assert.equal(report.status,'completed');
 assert.ok(!calls.some(c=>c.endpoint.startsWith('inventory/planets/')));
 assert.ok(calls.some(c=>c.endpoint.endsWith('/cities/owner')));
 assert.ok(calls.some(c=>c.endpoint.endsWith('/facilities/owner')));
});
