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
const shipyards=list.filter(s=>/shipyard/i.test(String(s.typeName??s.type_name??'')));
console.log(JSON.stringify({phase:'inventory',system,total:list.length,shipyards:shipyards.length,seconds:Math.round((Date.now()-start)/1000)}));
let complete=0,unknown=0,active=0;
const detailsStart=Date.now();
for(const station of shipyards){
 const detail=await client.stationDetail(String(station.uid));
 const op=stationOperations(detail);
 if(op.productionActions===null)unknown++;
 else {complete++;if(op.productionActions.length)active++;}
}
console.log(JSON.stringify({phase:'targeted-detail',system,shipyards:shipyards.length,complete,unknown,active,seconds:Math.round((Date.now()-detailsStart)/1000),totalSeconds:Math.round((Date.now()-start)/1000)}));
if(unknown)process.exitCode=1;
