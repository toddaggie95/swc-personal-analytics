import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations,syncFactionMaterials} from '../../src/swc/sync.js';
import {readJson,atomicWrite,withLock} from '../../src/storage/files.js';
import {productionState} from './production-contract.mjs';
import {readFileSync} from 'node:fs';

async function main(){
 const cfg=loadConfig();requireLive(cfg);
 const registry=JSON.parse(readFileSync(process.env.SWC_SYSTEMS_FILE!,'utf8'));
 const systems=new Set(registry.systems.map((s:{system:string})=>s.system));
 await withLock(cfg.privateDir,async()=>{
  const auth=await loadAuth(cfg),client=new ReadClient(auth,new SnapshotRun(cfg.privateDir,'production_inputs'));
  let details=0;
  for(const faction of ['tff','tjo'] as const){
   const inv=await syncFactionStations(client,new SnapshotRun(cfg.privateDir,'stations_'+faction),cfg.privateDir,faction,false);
   const doc=await readJson(inv.exportFile) as {stations:Array<Record<string,any>>,summary:Record<string,any>};
   const targets=doc.stations.filter(s=>/shipyard/i.test(s.typeName??'')&&systems.has(s.location?.system?.name));
   console.log('PRODUCTION_API_INVENTORY '+JSON.stringify({faction,stations:doc.stations.length,shipyardDetails:targets.length}));
   for(const station of targets){
    const detail=await client.stationDetail(station.uid);
    if(detail.uid!==station.uid||(detail.owner as any)?.attributes?.uid!==station.ownerUid)throw Error('Station identity/ownership changed');
    station.operations=productionState(detail);
    details++;
    if(details%25===0)console.log('PRODUCTION_API_PROGRESS '+JSON.stringify({details}));
   }
   doc.summary.productionDetails=targets.length;
   await atomicWrite(inv.exportFile,JSON.stringify(doc));
   await syncFactionMaterials(client,new SnapshotRun(cfg.privateDir,'materials_'+faction),cfg.privateDir,faction);
  }
  console.log('PRODUCTION_API_COMPLETE '+JSON.stringify({details}));
 });
}
main().catch(()=>{console.error('Production API collection failed. Sensitive diagnostics withheld; no production writes permitted.');process.exitCode=1;});
