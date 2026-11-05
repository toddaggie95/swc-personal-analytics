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
const inventory=await syncFactionStations(client,run,config.privateDir,'tjo',false,{kind:'system',name:system});
const list=(await readJson(inventory.exportFile) as {stations:Array<Record<string,unknown>>}).stations;
const types=Object.entries(list.reduce((acc,s)=>{const key=String(s.typeName??s.type_name??'(missing)');acc[key]=(acc[key]??0)+1;return acc;},{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]);
console.log(JSON.stringify({phase:'type-diagnostic',system,types,missingType:list.filter(s=>!s.typeName).length}));
// Bounded, deterministic cross-section: first five of each shipyard class, max 15.
const selected=types.filter(([name])=>/shipyard/i.test(name)).flatMap(([name])=>list.filter(s=>s.typeName===name).slice(0,5)).slice(0,15);
let actionsPresent=0,actionsAbsent=0,running=0,tooling=0,queue=0;
const detailStart=Date.now();
for(const station of selected){
 const detail=await client.stationDetail(String(station.uid));
 const op=stationOperations(detail);
 if(Array.isArray(op.productionActions)){actionsPresent++;running+=op.productionActions.filter(a=>a?.value?.status==='running').length;}
 else actionsAbsent++;
 if(op.tooledTo!==null)tooling++;
 if(op.queueItems!==null)queue++;
}
console.log(JSON.stringify({phase:'bounded-shipyard-sample',system,totalInventory:list.length,shipyards:list.filter(s=>/shipyard/i.test(String(s.typeName))).length,
 sampled:selected.length,actionsPresent,actionsAbsent,running,tooling,queue,detailSeconds:Math.round((Date.now()-detailStart)/1000),
 estimatedAllShipyardSeconds:Math.round((Date.now()-detailStart)/1000)*list.filter(s=>/shipyard/i.test(String(s.typeName))).length/Math.max(1,selected.length)}));
