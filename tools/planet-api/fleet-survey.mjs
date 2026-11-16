import{record,uid,unwrap}from'./capability-pilot.mjs';
export function fleetPage(body,{ownerUid,kind,start,total:expectedTotal}){
 const data=unwrap(body),entities=record(data.entities),a=record(entities.attributes);
 const integer=v=>(typeof v==='number'||typeof v==='string'&&v.trim())&&Number.isSafeInteger(Number(v))?Number(v):NaN;
 const total=integer(a.total),rows=entities.entity==null&&total===0?[]:entities.entity;
 if(!Array.isArray(rows)||integer(a.start)!==start||!Number.isSafeInteger(total)||total<0||rows.length>200||rows.length>total||total>0&&!rows.length||expectedTotal!=null&&total!==expectedTotal||a.count!=null&&integer(a.count)!==rows.length)throw Error('fleet-pagination');
 const values=rows.map(row=>record(row?.value&&typeof row.value==='object'?row.value:row)),seen=new Set();
 for(const row of values){const id=uid(row);if(!new RegExp('^'+(kind==='facilities'?'4':'7')+':\\d+$').test(id)||seen.has(id)||uid(row.owner)!==ownerUid)throw Error('fleet-owner-identity');seen.add(id);}
 return{total,rows:values};
}
export async function surveyOwner(read,{ownerUid,kind,maxPages=600,optional=false},checkpoint=async()=>{}){
 if(!/^20:\d+$/.test(ownerUid)||!['facilities','cities'].includes(kind))throw Error('survey-input');
 const result={ownerUid,kind,status:'collecting',rows:[],sources:[],total:null},seen=new Set();let start=1;
 try{
  for(let i=0;i<maxPages;i++){
   const response=await read(`inventory/${ownerUid}/${kind}/owner`,{start_index:start,item_count:200});
   result.sources.push(response.source);
   if((response.status===403||optional&&response.status===401)&&i===0){result.status='unavailable';result.httpStatus=response.status;return result;}
   if(response.status!==200)throw Error('survey-http');
   const page=fleetPage(response.body,{ownerUid,kind,start,total:result.total});result.total=page.total;
   for(const row of page.rows){if(seen.has(uid(row)))throw Error('survey-duplicate');seen.add(uid(row));result.rows.push(row);}
   if(result.rows.length>result.total)throw Error('survey-overflow');
   await checkpoint({ownerUid,kind,observed:result.rows.length,total:result.total});
   if(result.rows.length===result.total){result.status='complete';return result;}
   start+=page.rows.length;
  }
  throw Error('survey-page-bound');
 }finally{if(result.status==='collecting')result.status='partial';await checkpoint(result);}
}
export function indexFleet(inventories){
 const planets=new Map(),unlocated=[],seen=new Map();
 for(const doc of inventories){
  for(const row of doc.rows){
   const id=uid(row);if(seen.has(id))throw Error('fleet-duplicate-identity');seen.set(id,row);
   const location=record(row.location),ref=location.planet,pid=uid(ref);
   if(!/^8:\d+$/.test(pid)){unlocated.push({uid:id,kind:doc.kind,ownerUid:doc.ownerUid,reason:'no_planet_uid_in_observation'});continue;}
   if(!planets.has(pid))planets.set(pid,{planetUid:pid,names:[],facilityUids:[],cityUids:[],owners:[],sourceKinds:[],priority:null});
   const p=planets.get(pid),name=typeof ref.value==='string'?ref.value:null;
   if(name&&!p.names.includes(name))p.names.push(name);if(!p.owners.includes(doc.ownerUid))p.owners.push(doc.ownerUid);if(!p.sourceKinds.includes(doc.kind))p.sourceKinds.push(doc.kind);
   p[doc.kind==='facilities'?'facilityUids':'cityUids'].push(id);
  }
 }
 const list=[...planets.values()].map(p=>({...p,priority:p.facilityUids.length?'facility_planet':'city_only_no_owned_facilities',facilityCount:p.facilityUids.length,cityCount:p.cityUids.length})).sort((a,b)=>b.facilityCount-a.facilityCount||a.planetUid.localeCompare(b.planetUid));
 return{schemaVersion:1,kind:'fleet_owner_inventory_index',coverage:inventories.map(d=>({ownerUid:d.ownerUid,kind:d.kind,status:d.status,total:d.total,observed:d.rows.length})),planets:list,unlocated,
  allAccessibleOwnerInventoriesComplete:inventories.every(d=>d.status==='complete'),allPhysicalPlanetsVerified:false,
  notes:['This discovers planets with accessible owned facilities/cities; it does not discover every foreign facility.','Missing planetary locations remain unlocated; they are not silently discarded or assigned a guessed planet.','Complete owner inventories do not certify all-owner planetary coverage.']};
}
