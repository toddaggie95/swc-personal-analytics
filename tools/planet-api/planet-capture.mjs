import {createHash} from 'node:crypto';
import {record,uid,unwrap} from './capability-pilot.mjs';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const CONTRACT='planet-capture-v1';
export const MAX_AGE_MS=2*60*60*1000;
export function checkFresh(createdAt,now=Date.now()){
 const age=now-Date.parse(createdAt);if(!Number.isFinite(age)||age<0||age>MAX_AGE_MS)throw Error('capture-freshness');
}
const entityValue=row=>record(row?.value&&typeof row.value==='object'?row.value:row);
const integer=v=>(typeof v==='string'&&v.trim()||typeof v==='number')&&Number.isSafeInteger(Number(v))?Number(v):NaN;
export function inventoryPage(data,{start,planetUid,ownerUid,prefix}){
 const entities=record(data.entities),a=record(entities.attributes),total=integer(a.total);
 const rows=entities.entity==null&&total===0?[]:entities.entity;
 const count=a.count==null&&Array.isArray(rows)?rows.length:integer(a.count);
 if(!Array.isArray(rows)||!Number.isSafeInteger(total)||total<0||integer(a.start)!==start||count!==rows.length||
  count>200||count>total||total>0&&count===0)throw Error('inventory-pagination');
 const values=rows.map(entityValue),ids=new Set();
 for(const row of values){const id=uid(row);if(!new RegExp('^'+prefix+':\\d+$').test(id)||ids.has(id)||
  uid(row.owner)!==ownerUid||uid(record(row.location).planet)!==planetUid)throw Error('inventory-identity');ids.add(id);}
 return {total,count,rows:values};
}
export async function fullInventory(read,{ownerUid,planetUid,kind,maxPages=100}){
 if(!/^20:\d+$/.test(ownerUid)||!/^8:\d+$/.test(planetUid)||!['facilities','cities'].includes(kind))throw Error('inventory-input');
 const rows=[],sources=[],seen=new Set();let start=1,total;
 for(let page=0;page<maxPages;page++){
  const response=await read(`inventory/${ownerUid}/${kind}/owner`,{start_index:start,item_count:200,
   'filter_type[0]':'planet','filter_value[0]':planetUid,'filter_inclusion[0]':'includes'});
  if(response.status===403&&page===0)return {ownerUid,kind,status:'unavailable',rows:[],sources:[response.source],total:null};
  if(response.status!==200)throw Error('inventory-http');
  const parsed=inventoryPage(unwrap(response.body),{start,planetUid,ownerUid,prefix:kind==='cities'?'7':'4'});
  if(total!==undefined&&total!==parsed.total)throw Error('inventory-total-drift');total=parsed.total;
  for(const row of parsed.rows){if(seen.has(uid(row)))throw Error('inventory-duplicate');seen.add(uid(row));rows.push(row);}
  sources.push(response.source);
  if(rows.length>total)throw Error('inventory-overflow');
  if(rows.length===total)return {ownerUid,kind,status:'complete',rows,sources,total};
  start+=parsed.count;
 }
 throw Error('inventory-page-bound');
}
export async function fullTypeIndex(read){
 const types=[],sources=[],seen=new Set();let start=1,total;
 for(let page=0;page<10;page++){
  const response=await read('types/facilities/',{start_index:start,item_count:200});if(response.status!==200)throw Error('type-index-http');
  const data=unwrap(response.body),a=record(data.attributes),rows=data.facilitytype;
  const n=integer(a.total),count=a.count==null&&Array.isArray(rows)?rows.length:integer(a.count);
  if(!Array.isArray(rows)||integer(a.start)!==start||!Number.isSafeInteger(n)||n<0||count!==rows.length||count>200||n>0&&count===0||total!==undefined&&n!==total)throw Error('type-index-pagination');
  total=n;for(const row of rows){const id=uid(row);if(!/^4:\d+$/.test(id)||seen.has(id))throw Error('type-index-identity');seen.add(id);types.push({uid:id,name:row.value??null});}
  sources.push(response.source);if(types.length>total)throw Error('type-index-overflow');if(types.length===total)return {types,sources,total};start+=count;
 }
 throw Error('type-index-bound');
}
export function makeCapturePlan(inventory,{runId,analysisPublicKey}){
 const cities=new Map();
 for(const ref of record(inventory.planet.cities).city??[]){const id=uid(ref);if(!/^7:\d+$/.test(id)||cities.has(id))throw Error('public-city-identity');cities.set(id,{uid:id,expectedOwner:null,publicReference:ref});}
 for(const doc of inventory.inventories.filter(d=>d.kind==='cities'&&d.status==='complete'))for(const row of doc.rows){
  const id=uid(row),old=cities.get(id);if(old?.expectedOwner&&old.expectedOwner!==doc.ownerUid)throw Error('city-owner-conflict');
  cities.set(id,{...old,uid:id,expectedOwner:doc.ownerUid});
 }
 const batches=[];
 for(const [kind,targets]of [['cities',[...cities.values()].sort((a,b)=>a.uid.localeCompare(b.uid))],['types',inventory.typeIndex.types]])
  for(let i=0;i<targets.length;i+=25)batches.push({id:kind+'-'+String(i/25).padStart(3,'0'),kind,targets:targets.slice(i,i+25)});
 const plan={schemaVersion:1,contract:CONTRACT,runId,createdAt:inventory.createdAt,planetUid:uid(inventory.planet),
  inventoryHash:hash(inventory),analysisPublicKey,batches};
 plan.identity=hash(plan);return plan;
}
export function verifyPlan(plan){
 const {identity,...rest}=plan;if(plan.schemaVersion!==1||plan.contract!==CONTRACT||identity!==hash(rest)||!/^8:\d+$/.test(plan.planetUid))throw Error('plan-identity');
 checkFresh(plan.createdAt);const batchIds=new Set(),targets=new Set();
 for(const b of plan.batches){if(!/^(cities|types)-\d{3}$/.test(b.id)||batchIds.has(b.id)||!['cities','types'].includes(b.kind)||b.targets.length<1||b.targets.length>25)throw Error('batch-bound');batchIds.add(b.id);
  for(const t of b.targets){if(!(b.kind==='cities'?/^7:\d+$/:/^4:\d+$/).test(t.uid)||targets.has(b.kind+':'+t.uid))throw Error('target-identity');targets.add(b.kind+':'+t.uid);}
 }
 return plan;
}
export async function collectBatch(read,plan,id,save){
 verifyPlan(plan);const batch=plan.batches.find(b=>b.id===id);if(!batch)throw Error('unknown-batch');
 const result={schemaVersion:1,contract:CONTRACT,runId:plan.runId,planIdentity:plan.identity,id,kind:batch.kind,entries:[],complete:false};
 try{
  for(const target of batch.targets){checkFresh(plan.createdAt);
   const endpoint=batch.kind==='cities'?'inventory/cities/'+target.uid:'types/facilities/'+target.uid;
   const response=await read(endpoint,{});
   if(response.status!==200){
    if(batch.kind==='cities'&&!target.expectedOwner&&[401,403,404].includes(response.status)||batch.kind==='types'&&response.status===404){result.entries.push({uid:target.uid,status:'unavailable',httpStatus:response.status,source:response.source});continue;}
    throw Error('detail-http');
   }
   const data=unwrap(response.body);if(uid(data)!==target.uid)throw Error('detail-identity');
   if(batch.kind==='cities'&&(uid(record(data.location).planet)!==plan.planetUid||target.expectedOwner&&uid(data.owner)!==target.expectedOwner))throw Error('city-identity-drift');
   result.entries.push({uid:target.uid,status:'observed',data,source:response.source});
  }
  checkFresh(plan.createdAt);result.complete=true;
 }finally{await save(result);}
 return result;
}
