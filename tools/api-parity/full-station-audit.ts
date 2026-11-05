import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
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
const textFields=['info','infotext','infoText','information','description'] as const;
function extractInfo(detail:Record<string,unknown>,inventory:Record<string,unknown>){
 const sources=[detail,obj(detail.attributes),inventory,obj(inventory.attributes)];
 for(const source of sources)for(const field of textFields)if(hasOwn(source,field)){
  const value=source[field];
  if(typeof value==='string')return {available:true,text:value.trim(),field};
  if(value===null)return {available:true,text:'',field};
  return {available:false,text:'',field};
 }
 return {available:false,text:'',field:null};
}
// A free-form ship mention is not a verified ship assignment. A canonical ship
// catalog is required before treating nonblank InfoText as a proposed ship.
function idleAssignment(tooled:boolean,info:{available:boolean;text:string}){
 if(tooled)return 'idle-assigned-tooled';
 if(!info.available)return 'idle-assignment-unresolved';
 if(!info.text)return 'idle-unassigned';
 return 'idle-assignment-unresolved';
}
const cfg=loadConfig();requireLive(cfg);
const client=new ReadClient(await loadAuth(cfg),new SnapshotRun(cfg.privateDir,'full_station_audit'));
const inv=await syncFactionStations(client,new SnapshotRun(cfg.privateDir,'audit_'+system.toLowerCase()+'_'+faction),cfg.privateDir,faction as 'tjo'|'tff',false,{kind:'system',name:system});
const all=(await readJson(inv.exportFile) as {stations:Array<Record<string,unknown>>}).stations;
const unique=[...new Map(all.map(s=>[String(s.uid),s])).values()].sort((a,b)=>String(a.uid).localeCompare(String(b.uid),undefined,{numeric:true}));
const batch=unique.slice(offset,offset+limit);
const rows:Array<Record<string,unknown>>=[];
for(const station of batch){
 const uid=String(station.uid);
 try{
  const detail=await client.stationDetail(uid);
  const ops=stationOperations(detail);
  const actions=(ops.actions??[]).map(a=>String(attrs(a).type??obj(a).type??'unknown'));
  const statuses=(ops.queueItems??[]).map(q=>String(obj(q).status??'unknown'));
  const queueProducing=statuses.includes('producing');
  const productionAction=actions.includes('EntityProductionAction');
  const retooling=actions.includes('RetoolingAction');
  const unknownActions=actions.filter(a=>!['EntityProductionAction','RetoolingAction'].includes(a));
  const actionConflict=productionAction&&retooling;
  const queueConflict=queueProducing&&!productionAction;
  const info=extractInfo(detail,station);
  const classification=actionConflict||queueConflict?'conflict':unknownActions.length?'other-action':retooling?'retooling':productionAction?'producing':idleAssignment(ops.tooledTo!==null,info);
  const anomalies=[...(actionConflict?['production-and-retooling-actions']:[]),...(queueConflict?['producing-queue-without-production-action']:[]),...(productionAction&&!queueProducing?['production-action-without-producing-queue']:[]),...(unknownActions.length?['unknown-action-type']:[]),...(!productionAction&&!retooling&&ops.tooledTo===null&&!info.available?['infotext-unavailable']:[]),...(!productionAction&&!retooling&&ops.tooledTo===null&&info.available&&info.text?['infotext-needs-ship-validation']:[])];
  rows.push({uid,system,faction,stationType:station.typeName,classification,actions,queueStatuses:statuses,toolingPresent:ops.tooledTo!==null,infoFieldPresent:info.available,infoField:info.field,infoBlank:info.available?!info.text:null,infoNonblank:info.available&&!!info.text,actionsFieldPresent:'actions' in detail,queueFieldPresent:'queueitems' in detail,anomalies,detailRead:'ok'});
 }catch(e){rows.push({uid,system,faction,stationType:station.typeName,classification:'unknown',detailRead:'failed',errorClass:e instanceof Error?e.name:'UnknownError'});}
}
const counts=Object.fromEntries([...new Set(rows.map(r=>String(r.classification)))].map(k=>[k,rows.filter(r=>r.classification===k).length]));
const report={system,faction,totalInventory:all.length,uniqueInventory:unique.length,offset,limit,processed:rows.length,nextOffset:offset+rows.length<unique.length?offset+rows.length:null,counts,errors:rows.filter(r=>r.detailRead==='failed').length,anomalies:rows.filter(r=>Array.isArray(r.anomalies)&&(r.anomalies as string[]).length).length,rows};
mkdirSync('/tmp/swc-audit-output',{recursive:true});
writeFileSync('/tmp/swc-audit-output/station-audit.json',JSON.stringify(report,null,2));
console.log('AUDIT_SUMMARY '+JSON.stringify({...report,rows:undefined}));
for(const r of rows)if(r.classification==='unknown'||r.classification==='idle-assignment-unresolved'||r.classification==='conflict'||r.classification==='ambiguous-production-action'||r.classification==='other-action')console.log('AUDIT_REVIEW '+JSON.stringify(r));
if(report.errors)process.exitCode=2;
