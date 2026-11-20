import{fleetPage,indexFleet}from'./fleet-survey.mjs';import{hash}from'./planet-capture.mjs';
export async function planFleetPages(read,factions,{runId,analysisPublicKey,now=new Date().toISOString()}){
 const inventories=[],targets=[];
 for(const f of factions)for(const kind of['facilities','cities']){
  const r=await read(`inventory/${f.uid}/${kind}/owner`,{start_index:1,item_count:200});
  if(r.status===403||f.optional&&r.status===401){inventories.push({ownerUid:f.uid,kind,status:'unavailable',httpStatus:r.status,total:null,rows:[],sources:[r.source]});continue;}
  if(r.status!==200)throw Error('fleet-plan-http');
  const page=fleetPage(r.body,{ownerUid:f.uid,kind,start:1}),step=page.rows.length;
  inventories.push({ownerUid:f.uid,kind,status:'seeded',total:page.total,rows:page.rows,sources:[r.source]});
  if(page.total>step){if(step<1)throw Error('fleet-plan-page-size');for(let start=step+1;start<=page.total;start+=step)targets.push({ownerUid:f.uid,kind,start,total:page.total,expectedCount:Math.min(step,page.total-start+1)});}
 }
 if(targets.length>4000)throw Error('fleet-plan-bound');
 const batches=[];for(let i=0;i<targets.length;i+=25)batches.push({id:'pages-'+String(i/25).padStart(3,'0'),targets:targets.slice(i,i+25)});
 const plan={schemaVersion:1,contract:'fleet-owner-pages-v1',runId,createdAt:now,analysisPublicKey,factions,seedHash:hash(inventories),batches};plan.identity=hash(plan);
 return{plan,inventories};
}
export function verifyFleetPlan(plan){
 const{identity,...body}=plan;if(plan.contract!=='fleet-owner-pages-v1'||plan.schemaVersion!==1||hash(body)!==identity)throw Error('fleet-plan-integrity');
 const age=Date.now()-Date.parse(plan.createdAt);if(!Number.isFinite(age)||age<0||age>2*3600000)throw Error('fleet-plan-freshness');
 const seen=new Set();for(const b of plan.batches){if(!/^pages-\d{3}$/.test(b.id)||seen.has(b.id)||!b.targets.length||b.targets.length>25)throw Error('fleet-batch-bound');seen.add(b.id);for(const t of b.targets){const k=t.ownerUid+':'+t.kind+':'+t.start;if(seen.has(k)||!/^20:\d+$/.test(t.ownerUid)||!['facilities','cities'].includes(t.kind)||!Number.isSafeInteger(t.start)||t.start<2||!Number.isSafeInteger(t.expectedCount)||t.expectedCount<1||t.expectedCount>200)throw Error('fleet-target');seen.add(k);}}
 return plan;
}
export async function collectFleetPages(read,plan,id,save,resume=null){
 verifyFleetPlan(plan);const b=plan.batches.find(b=>b.id===id);if(!b)throw Error('fleet-batch');
 const result={schemaVersion:1,runId:plan.runId,planIdentity:plan.identity,id,complete:false,entries:[]};
 if(resume){if(resume.runId!==plan.runId||resume.planIdentity!==plan.identity||resume.id!==id||!Array.isArray(resume.entries)||resume.entries.length>b.targets.length)throw Error('fleet-resume-integrity');
  for(let i=0;i<resume.entries.length;i++){const t=b.targets[i],e=resume.entries[i];if(['ownerUid','kind','start','total','expectedCount'].some(k=>e[k]!==t[k])||e.rows.length!==t.expectedCount)throw Error('fleet-resume-prefix');}
  result.entries=structuredClone(resume.entries);result.parentPartialSha256=hash(resume);
 }
 try{for(const t of b.targets.slice(result.entries.length)){
  verifyFleetPlan(plan);const r=await read(`inventory/${t.ownerUid}/${t.kind}/owner`,{start_index:t.start,item_count:200});
  if(r.status!==200)throw Error('fleet-page-http');
  const p=fleetPage(r.body,{ownerUid:t.ownerUid,kind:t.kind,start:t.start,total:t.total});if(p.rows.length!==t.expectedCount)throw Error('fleet-page-count');
  result.entries.push({...t,rows:p.rows,source:r.source});
 }result.complete=true;}catch(error){result.failureCategory=/^fleet-[a-z-]+$/.test(error.message)?error.message:['TimeoutError','AbortError','TypeError'].includes(error.name)?error.name:'collection-stopped';throw error;}finally{await save(result);}return result;
}
export function assembleFleetPages(plan,seeds,batches){
 verifyFleetPlan(plan);if(hash(seeds)!==plan.seedHash)throw Error('fleet-seed-integrity');
 const documents=structuredClone(seeds),docs=new Map(documents.map(d=>[d.ownerUid+':'+d.kind,d])),results=new Map();
 for(const b of batches){if(b.runId!==plan.runId||b.planIdentity!==plan.identity||!b.complete||results.has(b.id))throw Error('fleet-result-integrity');results.set(b.id,b);}
 for(const b of plan.batches){const r=results.get(b.id);if(!r||r.entries.length!==b.targets.length)throw Error('fleet-result-coverage');
  for(let i=0;i<b.targets.length;i++){const t=b.targets[i],e=r.entries[i];if(['ownerUid','kind','start','total','expectedCount'].some(k=>e[k]!==t[k])||e.rows.length!==t.expectedCount)throw Error('fleet-target-mismatch');
   const d=docs.get(t.ownerUid+':'+t.kind);d.rows.push(...e.rows);d.sources.push(e.source);
  }
 }
 if(results.size!==plan.batches.length)throw Error('fleet-extra-result');
 for(const d of documents){if(d.status==='unavailable')continue;
  if(d.rows.length!==d.total||new Set(d.rows.map(r=>r.uid??r.attributes?.uid)).size!==d.total)throw Error('fleet-inventory-coverage');d.status='complete';
 }
 const inventory={schemaVersion:1,kind:'bounded_parallel_owner_inventory',runId:plan.runId,createdAt:plan.createdAt,factions:plan.factions,inventories:documents,status:'complete',planIdentity:plan.identity};
 const index=indexFleet(documents);inventory.contentSha256=hash(inventory);return{inventory,index};
}
