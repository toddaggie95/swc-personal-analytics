import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations} from '../../src/swc/sync.js';
import {readJson} from '../../src/storage/files.js';
import {stationOperations} from '../../src/swc/enrich-stations.js';
const system=process.env.TARGET_SYSTEM||'Chamble';
const config=loadConfig();requireLive(config);
const auth=await loadAuth(config);
const run=new SnapshotRun(config.privateDir,'targeted-stations');
const client=new ReadClient(auth,run);
const start=Date.now();
const inventory=await syncFactionStations(client,run,config.privateDir,'tff',false,{kind:'system',name:system});
const list=(await readJson(inventory.exportFile) as {stations:Array<Record<string,unknown>>}).stations;
const types=Object.entries(list.reduce((acc,s)=>{const key=String(s.typeName??s.type_name??'(missing)');acc[key]=(acc[key]??0)+1;return acc;},{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]);
console.log(JSON.stringify({phase:'type-diagnostic',system,types,missingType:list.filter(s=>!s.typeName).length}));
// Diagnose production capability with a bounded sample, not a full enrichment.
const sampleTypes=['Ataturk-class Station','Golan II','Depot Station IV'];
for(const type of sampleTypes){
 const station=list.find(s=>s.typeName===type);
 if(!station)continue;
 const started=Date.now();
 const detail=await client.stationDetail(String(station.uid));
 const op=stationOperations(detail);
 console.log(JSON.stringify({phase:'capability-sample',type,seconds:Math.round((Date.now()-started)/1000),
  actionsKnown:Array.isArray(op.productionActions),productionActionCount:op.productionActions?.length??null,
  toolingKnown:op.tooledTo!==null,queueKnown:op.queueItems!==null,
  topLevelFields:Object.keys(detail).filter(k=>!/(token|secret|auth)/i.test(k)).sort()}));
}
