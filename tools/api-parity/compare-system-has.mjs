// Read-only System HAS parity: includes station and facility material, not ship cargo.
import fs from 'node:fs';
import path from 'node:path';
import {csv} from '../production-sync/production-sync.mjs';
import {systemInventory} from '../production-sync/system-has-audit.mjs';
import {loadApi,normalizeMaterial,normalizeStation} from './compare-production-has.mjs';
const [webDir,apiDir,manifestPath,out]=process.argv.slice(2);
if(!out)throw Error('Usage: node compare-system-has.mjs WEB_DIR API_DIR MANIFEST OUT');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const systems=[...new Set(manifest.destinations.map(d=>d.system))];
const webS=[],webM=[],apiS=[],apiM=[];
for(const f of ['tff','tjo']){
  webS.push(...csv(fs.readFileSync(path.join(webDir,f+'-stations.csv'),'utf8')));
  webM.push(...csv(fs.readFileSync(path.join(webDir,f+'-materials.csv'),'utf8')));
  apiS.push(...loadApi(apiDir,f,'stations','all',systems).map(normalizeStation));
  apiM.push(...loadApi(apiDir,f,'materials','all',systems).map(normalizeMaterial));
}
const web=systemInventory(webS,webM,manifest),api=systemInventory(apiS,apiM,manifest);
const differences=[];
for(const sys of web.systems)for(const mat of web.materials){
  const w=web.systemTotals[sys][mat],a=api.systemTotals[sys]?.[mat];
  if(w!==a)differences.push({system:sys,material:mat,web:w,api:a,delta:a-w});
}
// Explain each changed total from underlying material piles, without logging pile IDs.
const included=(stations,materials)=>{
  const stationMap=new Map(stations.map(x=>[String(x.uid),x]));
  const map=new Map();
  for(const p of materials){
    const container=String(p.container_type_name??'');
    const station=container==='Stations'?stationMap.get(String(p.container_uid)):null;
    const system=container==='Facilities'?(p.system&&p.container_uid&&p.sysX!==''&&p.sysY!==''?p.system:null):station?.system;
    if(!system||!web.systemTotals[system])continue;
    const material=String(p.type_name??'').toLowerCase();
    const key=system+'|'+material;
    const list=map.get(key)??[];
    list.push({uid:String(p.uid),quantity:Number(p.quantity),container,containerUid:String(p.container_uid??''),system});
    map.set(key,list);
  }
  return map;
};
const webIncluded=included(webS,webM),apiIncluded=included(apiS,apiM);
const explanations=[];
for(const d of differences){
  const key=d.system+'|'+d.material;
  const w=new Map((webIncluded.get(key)??[]).map(p=>[p.uid,p]));
  const a=new Map((apiIncluded.get(key)??[]).map(p=>[p.uid,p]));
  const missing=[...w.values()].filter(p=>!a.has(p.uid));
  const extra=[...a.values()].filter(p=>!w.has(p.uid));
  const changed=[...w.values()].filter(p=>a.has(p.uid)&&a.get(p.uid).quantity!==p.quantity)
    .map(p=>({uid:p.uid,web:p.quantity,api:a.get(p.uid).quantity}));
  const moved=[...w.values()].filter(p=>a.has(p.uid)&&a.get(p.uid).containerUid!==p.containerUid)
    .map(p=>({uid:p.uid,webContainer:p.containerUid,apiContainer:a.get(p.uid).containerUid}));
  const missingQty=missing.reduce((n,p)=>n+p.quantity,0);
  const extraQty=extra.reduce((n,p)=>n+p.quantity,0);
  const changedDelta=changed.reduce((n,p)=>n+p.api-p.web,0);
  const explainedDelta=extraQty-missingQty+changedDelta;
  explanations.push({system:d.system,material:d.material,delta:d.delta,explainedDelta,
    missingCount:missing.length,extraCount:extra.length,changedCount:changed.length,movedCount:moved.length,
    missingQuantity:missingQty,extraQuantity:extraQty,changedDelta,
    category:missing.length||extra.length||changed.length?'pile_membership_or_quantity':'unexplained',
    // Private output only. Never publish these identities to public Actions logs.
    privatePiles:{missing,extra,changed,moved}});
}
const webStationIds=new Set(webS.map(x=>String(x.uid)));
const webPileIds=new Set(webM.map(x=>String(x.uid)));
const causeCounts={};
for(const e of explanations)for(const p of e.privatePiles.extra){
  const cause=!webPileIds.has(p.uid)?'absent_web_pile':p.container==='Stations'&&!webStationIds.has(p.containerUid)?'absent_web_station':'other';
  causeCounts[cause]=(causeCounts[cause]??0)+1;
}
const webByUid=new Map(webM.map(x=>[String(x.uid),x]));
const apiByUid=new Map(apiM.map(x=>[String(x.uid),x]));
const exclusionCauses={};
for(const e of explanations)for(const p of e.privatePiles.extra){
  const w=webByUid.get(p.uid),a=apiByUid.get(p.uid);
  let reason='unclassified';
  if(!w)reason='missing_web_pile';
  else if(w.container_type_name!==a.container_type_name)reason='container_type_mismatch';
  else if(String(w.container_uid)!==String(a.container_uid))reason='container_uid_mismatch';
  else if(w.system!==a.system)reason='system_mismatch';
  else if(w.container_type_name==='Facilities'&&(w.sysX===''||w.sysY===''))reason='missing_web_facility_coordinates';
  else if(w.container_type_name==='Stations')reason='station_location_or_registry';
  else reason='other';
  exclusionCauses[reason]=(exclusionCauses[reason]??0)+1;
}
const publicAttribution=explanations.map(x=>({
  system:x.system,material:x.material,delta:x.delta,missingCount:x.missingCount,
  extraCount:x.extraCount,changedCount:x.changedCount,movedCount:x.movedCount,
  missingQuantity:x.missingQuantity,extraQuantity:x.extraQuantity,
  changedDelta:x.changedDelta,reconciled:x.delta===x.explainedDelta
}));
const report={mode:'read_only',status:differences.length?'differences':'matched',
  statistics:{systems:web.systems.length,cells:web.systems.length*web.materials.length,
    differences:differences.length,webPiles:web.statistics.uniquePiles,apiPiles:api.statistics.uniquePiles,
    webErrors:web.errors.length,apiErrors:api.errors.length,
    webInvariants:web.discrepancies.length,apiInvariants:api.discrepancies.length,
    webExcluded:web.excluded,apiExcluded:api.excluded},
  differences,explanations,publicAttribution,causeCounts,exclusionCauses};
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
if(web.errors.length||api.errors.length||web.discrepancies.length||api.discrepancies.length)process.exitCode=1;
