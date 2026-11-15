import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const url=name=>JSON.stringify(new URL(name,import.meta.url).href);
test('interrupted collection resumes completed UIDs and requires all details before materials',async()=>{
 let source=readFileSync(new URL('./collect-production-inputs.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 source=source.replace("readFileSync(new URL('./production-contract.mjs',import.meta.url))","'fixture-contract'");
 source=source.slice(0,source.indexOf('main().catch('));
 const prelude=`
 const {productionState}=await import(${url('./production-contract.mjs')});
 const {planIdentity,newProgress,validateProgress,MAX_AGE_MS}=await import(${url('./production-progress.mjs')});
 const store=new Map(),calls=[],materialCalls=[],counts={me:0};let fail=true;
 const stations=[{uid:'5:1',ownerUid:'20:1',typeName:'Shipyard I',location:{system:{name:'Test',uid:'9:1'}}},{uid:'5:2',ownerUid:'20:2',typeName:'Shipyard I',location:{system:{name:'Test',uid:'9:1'}}}];
 const loadConfig=()=>({privateDir:'/fixture'}),requireLive=()=>{},loadAuth=async()=>({}),withLock=async(_,fn)=>fn();
 const readFileSync=()=>JSON.stringify({systems:[{system:'Test'}]}),existsSync=p=>store.has(p),join=(...p)=>p.join('/');
 const readJson=async p=>JSON.parse(store.get(p)),atomicWrite=async(p,data)=>{store.set(p,data);};
 class SnapshotRun{};class ReadPacer{summary(){return {};}}
 class ReadClient{async me(){counts.me++;return {};}async stationDetail(uid){calls.push(uid);if(uid==='5:2'&&fail)throw Error('fixture interruption');return {uid,owner:{attributes:{uid:uid==='5:1'?'20:1':'20:2'}}};}}
 async function syncFactionStations(client,run,root,faction){await client.me();const exportFile='/'+faction;store.set(exportFile,JSON.stringify({stations:[structuredClone(stations[faction==='tff'?0:1])],summary:{}}));return {exportFile};}
 async function syncFactionMaterials(client,run,root,faction){await client.me();materialCalls.push(faction);}
 export const fixture={store,calls,materialCalls,counts,resume:()=>{fail=false;details=0;}};
 `;
 const {main,fixture}=await import('data:text/javascript;base64,'+Buffer.from(prelude+stripTypeScriptTypes(source)+'\nexport {main};').toString('base64'));
 await assert.rejects(main(),/fixture interruption/);
 assert.deepEqual(fixture.materialCalls,[]);
 assert.equal(JSON.parse(fixture.store.get('/fixture/production-progress.json')).entries.length,1);
 fixture.resume();await main();
 assert.deepEqual(fixture.calls,['5:1','5:2','5:2']);
 assert.deepEqual(fixture.materialCalls,['tff','tjo']);
 assert.equal(fixture.counts.me,2); // One authenticated mapping per invocation, not four.
 for(const faction of ['tff','tjo'])assert.equal(JSON.parse(fixture.store.get('/'+faction)).summary.productionDetails,1);
});
