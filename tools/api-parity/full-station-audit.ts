import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {ReadPacer} from '../../src/swc/read-pacer.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations} from '../../src/swc/sync.js';
import {readJson} from '../../src/storage/files.js';
import {stationOperations} from '../../src/swc/enrich-stations.js';
import {writeFileSync,mkdirSync} from 'node:fs';
const system=process.env.TARGET_SYSTEM||'Kashyyyk';
const faction=process.env.TARGET_FACTION||'tjo';
const offset=Number(process.env.TARGET_OFFSET??0);
const limit=Number(process.env.TARGET_LIMIT??25);
if(!['tjo','tff'].includes(faction)||!['Kashyyyk','Tholatin','Daluuj'].includes(system)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Invalid bounded audit inputs');
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const attrs=(v:unknown)=>obj(obj(v).attributes);
const hasOwn=(v:Record<string,unknown>,k:string)=>Object.prototype.hasOwnProperty.call(v,k);
// InfoText is not an authoritative assignment source. Idle tooling alone determines assignment.
function idleAssignment(tooled:boolean){
 return tooled?'idle-assigned-tooled':'idle-unassigned';
}
const auditStarted=Date.now();
const shipyardsOnly=process.env.TARGET_SHIPYARDS_ONLY==='1';
const cfg=loadConfig();requireLive(cfg);
const pace={waitMs:0,calls:0,headersPresent:0,headersMissing:0};
const transport={requests:0,fetchMs:0,bodyMs:0,bodyBytes:0};
const measuredFetch:typeof fetch=async(input,init)=>{
 const t=performance.now();
 const response=await fetch(input,init);
 transport.requests++;
 transport.fetchMs+=performance.now()-t;
 const original=response.arrayBuffer.bind(response);
 response.arrayBuffer=async()=>{const started=performance.now();const bytes=await original();transport.bodyMs+=performance.now()-started;transport.bodyBytes+=bytes.byteLength;return bytes;};
 return response;
};
class MeasuredPacer extends ReadPacer {
 async beforeRequest(resource:string) {
  const started=performance.now();
  try { await super.beforeRequest(resource); }
  finally { pace.waitMs+=performance.now()-started; pace.calls++; }
 }
 afterResponse(resource:string,headers:Headers) {
  const w=super.afterResponse(resource,headers);
  if(w.limit!==null&&w.remaining!==null&&w.resetAtMs!==null)pace.headersPresent++;
  else pace.headersMissing++;
  return w;
 }
}
const client=new ReadClient(await loadAuth(cfg),new SnapshotRun(cfg.privateDir,'full_station_audit'),measuredFetch,undefined,new MeasuredPacer());
const inv=await syncFactionStations(client,new SnapshotRun(cfg.privateDir,'audit_'+system.toLowerCase()+'_'+faction),cfg.privateDir,faction as 'tjo'|'tff',false,{kind:'system',name:system});
const inventoryMs=Date.now()-auditStarted;
const all=(await readJson(inv.exportFile) as {stations:Array<Record<string,unknown>>}).stations;
const unique=[...new Map(all.map(s=>[String(s.uid),s])).values()].sort((a,b)=>String(a.uid).localeCompare(String(b.uid),undefined,{numeric:true}));
const candidates=shipyardsOnly?unique.filter(s=>/shipyard/i.test(String(s.typeName??''))):unique;
const batch=candidates.slice(offset,offset+limit);
const detailDurations:number[]=[];
const rows:Array<Record<string,unknown>>=[];
for(const station of batch){
 const uid=String(station.uid);
 const detailStarted=Date.now();
 try{
  const detail=await client.stationDetail(uid);
  detailDurations.push(Date.now()-detailStarted);
  const ops=stationOperations(detail);
  const actions=(ops.actions??[]).map(a=>String(attrs(a).type??obj(a).type??'unknown'));
  const statuses=(ops.queueItems??[]).map(q=>String(obj(q).status??'unknown'));
  const queueProducing=statuses.includes('producing');
  const productionAction=actions.includes('EntityProductionAction');
  const retooling=actions.includes('RetoolingAction');
  const unknownActions=actions.filter(a=>!['EntityProductionAction','RetoolingAction'].includes(a));
  // SWC retooling can legitimately expose both action types; a producing queue during retooling is the actual conflict.
  const actionConflict=productionAction&&retooling&&queueProducing;
  const queueConflict=queueProducing&&!productionAction;
  const classification=actionConflict||queueConflict?'conflict':unknownActions.length?'other-action':retooling?'retooling':productionAction?'producing':idleAssignment(ops.tooledTo!==null);
  const anomalies=[...(actionConflict?['simultaneous-retooling-and-producing-queue']:[]),...(queueConflict?['producing-queue-without-production-action']:[]),...(productionAction&&!queueProducing&&!retooling?['production-action-without-producing-queue']:[]),...(unknownActions.length?['unknown-action-type']:[])];
  rows.push({uid,system,faction,stationType:station.typeName,classification,actions,queueStatuses:statuses,toolingPresent:ops.tooledTo!==null,actionsFieldPresent:'actions' in detail,queueFieldPresent:'queueitems' in detail,anomalies,detailRead:'ok'});
 }catch(e){detailDurations.push(Date.now()-detailStarted);rows.push({uid,system,faction,stationType:station.typeName,classification:'unknown',detailRead:'failed',errorClass:e instanceof Error?e.name:'UnknownError'});}
}
const counts=Object.fromEntries([...new Set(rows.map(r=>String(r.classification)))].map(k=>[k,rows.filter(r=>r.classification===k).length]));
const sortedTimes=[...detailDurations].sort((a,b)=>a-b);
const percentile=(p:number)=>sortedTimes.length?sortedTimes[Math.ceil(sortedTimes.length*p)-1]:null;
const timings={inventoryMs,detailTotalMs:detailDurations.reduce((a,b)=>a+b,0),detailMinMs:sortedTimes[0]??null,detailP50Ms:percentile(.5),detailP95Ms:percentile(.95),detailMaxMs:sortedTimes.at(-1)??null,elapsedMs:Date.now()-auditStarted,pace,transport};
const report={system,faction,totalInventory:all.length,uniqueInventory:unique.length,eligibleInventory:candidates.length,shipyardsOnly,offset,limit,processed:rows.length,nextOffset:offset+rows.length<candidates.length?offset+rows.length:null,counts,errors:rows.filter(r=>r.detailRead==='failed').length,anomalies:rows.filter(r=>Array.isArray(r.anomalies)&&(r.anomalies as string[]).length).length,timings,rows};
mkdirSync('/tmp/swc-audit-output',{recursive:true});
writeFileSync('/tmp/swc-audit-output/station-audit.json',JSON.stringify(report,null,2));
console.log('AUDIT_SUMMARY '+JSON.stringify({...report,rows:undefined}));
for(const r of rows)if(r.classification==='unknown'||r.classification==='idle-assignment-unresolved'||r.classification==='conflict'||r.classification==='ambiguous-production-action'||r.classification==='other-action')console.log('AUDIT_REVIEW '+JSON.stringify(r));
if(report.errors)process.exitCode=2;
