import {isDeepStrictEqual} from 'node:util';
import {planIdentity,newProgress,validateProgress} from './production-progress.mjs';

const copy=value=>structuredClone(value);
const kindOf=document=>document?.doc?.summary?.entityType??(/materials/.test(document?.name)?'materials':/stations/.test(document?.name)?'stations':null);
function targetStations(documents,systems){
 if(!Array.isArray(systems)||!systems.length||systems.some(s=>typeof s!=='string'||!s.trim())||new Set(systems).size!==systems.length)throw Error('Invalid production systems');
 if(!Array.isArray(documents)||!documents.length)throw Error('Missing station documents');
 const names=new Set(),sources=new Set(),uids=new Set(),targets=[];
 for(const document of documents){
  const kind=kindOf(document),source=document?.faction+':'+kind;
  if(typeof document?.name!=='string'||!document.name||names.has(document.name)||!['tff','tjo'].includes(document.faction)||!['stations','materials'].includes(kind)||sources.has(source)||!Array.isArray(document.doc?.[kind])||!document.doc.summary||typeof document.doc.summary!=='object')throw Error('Invalid station document');
  names.add(document.name);sources.add(source);
  if(kind!=='stations')continue;
  for(const station of document.doc.stations){
   if(!/^5:\d+$/.test(station?.uid)||!/^20:\d+$/.test(station.ownerUid)||uids.has(station.uid))throw Error('Invalid or duplicate station identity');
   if(document.doc.summary.ownerUid!==undefined&&document.doc.summary.ownerUid!==station.ownerUid)throw Error('Station owner does not match document');
   uids.add(station.uid);
   if(/shipyard/i.test(station.typeName??'')&&systems.includes(station.location?.system?.name))targets.push(station);
  }
 }
 return targets.sort((a,b)=>a.uid.localeCompare(b.uid));
}

export function makePlan(documents,systems,contract,prior=null,now=Date.now()){
 const owned=copy(documents),targets=targetStations(owned,systems),identity=planIdentity(targets,contract);
 const progress=prior===null?newProgress(identity,now):copy(prior);
 const restored=validateProgress(progress,identity,targets,now),pending=targets.filter(s=>!restored.has(s.uid));
 const batches=[];
 for(let start=0;start<pending.length;start+=50)batches.push({id:String(batches.length).padStart(3,'0'),stations:copy(pending.slice(start,start+50))});
 if(!batches.length)batches.push({id:'complete',stations:[]});
 return {version:1,identity,createdAt:progress.createdAt,plannedAt:new Date(now).toISOString(),systems:copy(systems),documents:owned,progress,batches};
}

export function validatePlan(plan,contract,now=Date.now()){
 if(plan?.version!==1)throw Error('Invalid production plan version');
 const targets=targetStations(plan.documents,plan.systems),identity=planIdentity(targets,contract);
 const restored=validateProgress(plan.progress,identity,targets,now),planned=Date.parse(plan.plannedAt);
 if(plan.identity!==identity||plan.createdAt!==plan.progress.createdAt||!Number.isFinite(planned)||planned<Date.parse(plan.createdAt)||planned>now||!Array.isArray(plan.batches)||!plan.batches.length)throw Error('Invalid production plan identity or time');
 const pending=new Map(targets.filter(s=>!restored.has(s.uid)).map(s=>[s.uid,s])),seen=new Set(),ids=new Set();
 for(const batch of plan.batches){
  if(typeof batch?.id!=='string'||!(/^[0-9]{3,}$/.test(batch.id)||batch.id==='complete')||ids.has(batch.id)||!Array.isArray(batch.stations)||batch.stations.length>50)throw Error('Invalid production batch');
  ids.add(batch.id);
  if(batch.id==='complete'){
   if(pending.size||plan.batches.length!==1||batch.stations.length)throw Error('Invalid completed plan placeholder');
  }else if(!batch.stations.length)throw Error('Empty production batch');
  for(const station of batch.stations){
   if(!pending.has(station.uid)||seen.has(station.uid)||!isDeepStrictEqual(station,pending.get(station.uid)))throw Error('Unexpected or modified batch station');
   seen.add(station.uid);
  }
 }
 if(seen.size!==pending.size)throw Error('Missing production batch coverage');
 return targets;
}

export function selectBatch(plan,id,contract,now=Date.now()){
 validatePlan(plan,contract,now);
 const batch=plan.batches.find(b=>b.id===id);
 if(!batch)throw Error('Unknown production batch');
 return copy(batch);
}

export function mergeResults(plan,results,contract,now=Date.now()){
 const targets=validatePlan(plan,contract,now);
 if(!Array.isArray(results))throw Error('Invalid production results');
 const batches=new Map(plan.batches.map(b=>[b.id,b])),seen=new Set(),progress=copy(plan.progress);
 for(const result of results){
  const batch=batches.get(result?.id);
  if(!batch||seen.has(result.id)||result.identity!==plan.identity||!Array.isArray(result.entries))throw Error('Unknown, duplicate or incompatible batch result');
  seen.add(result.id);
  const allowed=new Set(batch.stations.map(s=>s.uid));
  for(const entry of result.entries){
   if(!allowed.has(entry?.uid))throw Error('Result station is outside assigned batch');
   progress.entries.push(copy(entry));
  }
 }
 const operations=validateProgress(progress,plan.identity,targets,now);
 const missing=targets.filter(s=>!operations.has(s.uid)).map(s=>s.uid),complete=missing.length===0;
 const documents=copy(plan.documents),targetUids=new Set(targets.map(s=>s.uid));
 for(const document of documents){
  if(kindOf(document)!=='stations')continue;
  const {doc}=document;
  let count=0;
  for(const station of doc.stations){
   if(targetUids.has(station.uid)){
    delete station.operations;
    if(operations.has(station.uid))station.operations=copy(operations.get(station.uid));
    count++;
   }
  }
  delete doc.summary.productionDetails;
  if(complete)doc.summary.productionDetails=count;
 }
 return {documents,progress,missing,complete};
}
