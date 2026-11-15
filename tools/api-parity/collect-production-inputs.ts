import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations,syncFactionMaterials} from '../../src/swc/sync.js';
import {readJson,atomicWrite,withLock} from '../../src/storage/files.js';
import {productionState} from './production-contract.mjs';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {failureCategory} from './collection-diagnostics.mjs';
import {planIdentity,newProgress,validateProgress,MAX_AGE_MS} from './production-progress.mjs';
import {ReadPacer} from '../../src/swc/read-pacer.js';

let phase='configuration',details=0;

async function main(){
 const cfg=loadConfig();requireLive(cfg);
 const registry=JSON.parse(readFileSync(process.env.SWC_SYSTEMS_FILE!,'utf8'));
 const systems=new Set(registry.systems.map((s:{system:string})=>s.system));
 await withLock(cfg.privateDir,async()=>{
  const started=Date.now(),auth=await loadAuth(cfg),pacer=new ReadPacer();
  let requests=0,fetchMs=0;
  const measuredFetch:typeof fetch=async(...args)=>{const start=Date.now();requests++;try{return await fetch(...args);}finally{fetchMs+=Date.now()-start;}};
  const client=new ReadClient(auth,new SnapshotRun(cfg.privateDir,'production_inputs'),measuredFetch,undefined,pacer);
  const me=client.me.bind(client);let character:ReturnType<typeof me>|undefined;
  client.me=()=>character??=me();
  const inventories=[];
  for(const faction of ['tff','tjo'] as const){
   phase='station-inventory';
   const inv=await syncFactionStations(client,new SnapshotRun(cfg.privateDir,'stations_'+faction),cfg.privateDir,faction,false);
   const doc=await readJson(inv.exportFile) as {stations:Array<Record<string,any>>,summary:Record<string,any>};
   const targets=doc.stations.filter(s=>/shipyard/i.test(s.typeName??'')&&systems.has(s.location?.system?.name));
   console.log('PRODUCTION_API_INVENTORY '+JSON.stringify({faction,stations:doc.stations.length,shipyardDetails:targets.length}));
   inventories.push({faction,inv,doc,targets});
  }
  const targets=inventories.flatMap(i=>i.targets);
  const identity=planIdentity(targets,readFileSync(new URL('./production-contract.mjs',import.meta.url)));
  const progressFile=join(cfg.privateDir,'production-progress.json');
  const progress=existsSync(progressFile)?await readJson(progressFile):newProgress(identity);
  phase='checkpoint-validation';
  const restored=validateProgress(progress,identity,targets);
  for(const station of targets)if(restored.has(station.uid))station.operations=restored.get(station.uid);
  let reused=restored.size;
  console.log('PRODUCTION_API_RESUME '+JSON.stringify({reused,remaining:targets.length-reused}));
  const save=async()=>{
   await atomicWrite(progressFile,JSON.stringify(progress));
   for(const {doc,inv} of inventories)await atomicWrite(inv.exportFile,JSON.stringify(doc));
  };
  try { for(const station of targets){
    if(restored.has(station.uid))continue;
    if(Date.now()-Date.parse(progress.createdAt)>MAX_AGE_MS)throw Error('Production observation window expired');
    phase='station-read';
    const detail=await client.stationDetail(station.uid);
    phase='station-contract';
    if(detail.uid!==station.uid||(detail.owner as any)?.attributes?.uid!==station.ownerUid)throw Error('Station identity/ownership changed');
    station.operations=productionState(detail);
    progress.entries.push({uid:station.uid,ownerUid:station.ownerUid,operations:station.operations});
    details++;
    if(details%25===0){
     await save();
     console.log('PRODUCTION_API_PROGRESS '+JSON.stringify({details,reused,requests,elapsedMs:Date.now()-started,fetchMs,...pacer.summary()}));
    }
   } } finally {
    // Preserve validated successes even if the next read/refresh/contract fails.
    // Partial files are diagnostics only; canonical conversion still requires complete coverage.
    await save();
   }
  // Recheck age and exact coverage after the final response, including any quota wait.
  const complete=validateProgress(progress,identity,targets);
  if(complete.size!==targets.length)throw Error('Incomplete production detail coverage');
  for(const {faction,doc,inv,targets} of inventories){
   doc.summary.productionDetails=targets.length;
   await atomicWrite(inv.exportFile,JSON.stringify(doc));
   phase='material-inventory';
   await syncFactionMaterials(client,new SnapshotRun(cfg.privateDir,'materials_'+faction),cfg.privateDir,faction);
  }
  validateProgress(progress,identity,targets);
  console.log('PRODUCTION_API_COMPLETE '+JSON.stringify({details,reused,requests,elapsedMs:Date.now()-started,fetchMs,...pacer.summary()}));
 });
}
main().catch(error=>{console.error('PRODUCTION_API_FAILURE '+JSON.stringify({phase,details,category:failureCategory(error,phase)}));process.exitCode=1;});
