import{hash}from'./planet-capture.mjs';import{uid,record,unwrap}from'./capability-pilot.mjs';import{indexFleet}from'./fleet-survey.mjs';
export function makeResourcePlan(inventory,{phase,planetEntries=[],runId,analysisPublicKey}){
 const{contentSha256,...body}=inventory;if(hash(body)!==contentSha256||inventory.status!=='complete'||!['planets','cities'].includes(phase))throw Error('resource-source');
 const index=indexFleet(inventory.inventories),targets=[],gaps=[];
 if(phase==='planets')for(const p of index.planets){if(p.names.length!==1){gaps.push({planetUid:p.planetUid,reason:'ambiguous_planet_name'});continue;}targets.push({uid:p.planetUid,name:p.names[0]});}
 else{
  const map=new Map();for(const e of planetEntries){if(e.status!=='observed'){gaps.push({planetUid:e.uid,reason:'planet_detail_unavailable'});continue;}
   const refs=record(e.data.cities).city;for(const ref of refs==null?[]:Array.isArray(refs)?refs:[refs]){
    const id=uid(ref);if(!/^7:\d+$/.test(id)||map.has(id)&&map.get(id).planetUid!==e.uid)throw Error('resource-city-reference');map.set(id,{uid:id,planetUid:e.uid,expectedOwner:null});
   }
  }
  for(const d of inventory.inventories.filter(d=>d.kind==='cities'&&d.status==='complete'))for(const row of d.rows){const id=uid(row),pid=uid(record(row.location).planet);if(!/^8:\d+$/.test(pid)){gaps.push({uid:id,reason:'unlocated_city'});continue;}if(map.has(id)&&map.get(id).planetUid!==pid)throw Error('resource-owned-city-planet');map.set(id,{uid:id,planetUid:pid,expectedOwner:d.ownerUid});}
  targets.push(...[...map.values()].sort((a,b)=>a.uid.localeCompare(b.uid)));
 }
 const size=phase==='planets'?25:80,batches=[];if(targets.length>size*250)throw Error('resource-matrix-bound');for(let i=0;i<targets.length;i+=size)batches.push({id:'resource-'+String(i/size).padStart(3,'0'),targets:targets.slice(i,i+size)});
 const plan={schemaVersion:1,contract:'fleet-resources-v1',phase,runId,createdAt:new Date().toISOString(),parentOwnerInventorySha256:contentSha256,analysisPublicKey,batches,gaps};plan.identity=hash(plan);return plan;
}
export function verifyResourcePlan(plan){const{identity,...body}=plan,age=Date.now()-Date.parse(plan.createdAt);if(plan.contract!=='fleet-resources-v1'||hash(body)!==identity||!Number.isFinite(age)||age<0||age>2*3600000||!['planets','cities'].includes(plan.phase))throw Error('resource-plan');const seen=new Set();for(const b of plan.batches){if(!/^resource-\d{3}$/.test(b.id)||seen.has(b.id)||!b.targets.length||b.targets.length>80)throw Error('resource-batch');seen.add(b.id);for(const t of b.targets){if(!new RegExp('^'+(plan.phase==='planets'?'8':'7')+':\\d+$').test(t.uid)||seen.has(t.uid))throw Error('resource-target');seen.add(t.uid);}}return plan;}
export async function collectResourceBatch(read,plan,id,save){
 verifyResourcePlan(plan);const b=plan.batches.find(b=>b.id===id);if(!b)throw Error('resource-batch-id');
 const result={schemaVersion:1,runId:plan.runId,planIdentity:plan.identity,phase:plan.phase,id,complete:false,entries:[]};
 try{for(const t of b.targets){
  const endpoint=plan.phase==='planets'?'galaxy/planets/'+encodeURIComponent(t.name).replace(/'/g,'%27')+'/':'inventory/cities/'+t.uid;
  let r;try{r=await read(endpoint,{});}catch(error){if(['TimeoutError','AbortError','TypeError'].includes(error.name)||error.message==='non-json'){result.entries.push({uid:t.uid,planetUid:t.planetUid??t.uid,status:'transport_error',source:error.source??null});continue;}throw error;}
  if(r.status!==200){if([403,404].includes(r.status)||r.status===401&&plan.phase==='cities'&&!t.expectedOwner){result.entries.push({uid:t.uid,planetUid:t.planetUid??t.uid,status:'unavailable',httpStatus:r.status,source:r.source});continue;}throw Error('resource-auth-or-http');}
  const data=unwrap(r.body);if(uid(data)!==t.uid||plan.phase==='cities'&&(uid(record(data.location).planet)!==t.planetUid||t.expectedOwner&&uid(data.owner)!==t.expectedOwner))throw Error('resource-identity');
  result.entries.push({uid:t.uid,planetUid:t.planetUid??t.uid,status:'observed',data,source:r.source});
 }result.complete=true;}finally{await save(result);}return result;
}
export function assembleResources(plan,batches){
 verifyResourcePlan(plan);const results=new Map();for(const b of batches){if(b.runId!==plan.runId||b.planIdentity!==plan.identity||results.has(b.id))throw Error('resource-result');results.set(b.id,b);}
 const entries=[],gaps=[...plan.gaps];
 for(const b of plan.batches){const r=results.get(b.id),targets=new Set(b.targets.map(t=>t.uid)),seen=new Set();for(const e of r?.entries??[]){if(!targets.has(e.uid)||seen.has(e.uid))throw Error('resource-result-target');seen.add(e.uid);entries.push(e);}for(const t of b.targets)if(!seen.has(t.uid)){entries.push({uid:t.uid,planetUid:t.planetUid??t.uid,status:'not_observed'});gaps.push({uid:t.uid,reason:'missing_worker_observation'});}}
 if(results.size>plan.batches.length)throw Error('resource-extra-batch');
 const result={schemaVersion:1,kind:'fleet_resource_observations',phase:plan.phase,runId:plan.runId,parentOwnerInventorySha256:plan.parentOwnerInventorySha256,planIdentity:plan.identity,createdAt:plan.createdAt,entries,gaps};result.contentSha256=hash(result);return result;
}
