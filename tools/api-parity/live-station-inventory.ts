import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations} from '../../src/swc/sync.js';
import {readJson} from '../../src/storage/files.js';
import {mkdirSync,writeFileSync} from 'node:fs';
const cfg=loadConfig();requireLive(cfg);
const client=new ReadClient(await loadAuth(cfg),new SnapshotRun(cfg.privateDir,'full_inventory'));
const factions:Record<string,string[]>={};
for(const faction of ['tff','tjo'] as const){
 const inv=await syncFactionStations(client,new SnapshotRun(cfg.privateDir,'inventory_'+faction),cfg.privateDir,faction,false);
 const stations=(await readJson(inv.exportFile) as {stations:Array<{uid:string|number}>}).stations;
 const ids=stations.map(s=>String(s.uid));
 if(ids.some(id=>!/^\d+$/.test(id))||new Set(ids).size!==ids.length)throw Error('Invalid or duplicate station IDs');
 factions[faction]=ids;
 console.log('INVENTORY_FACTION '+JSON.stringify({faction,count:ids.length}));
}
mkdirSync('/tmp/station-plan',{recursive:true});
writeFileSync('/tmp/station-plan/inventory.json',JSON.stringify({factions}));
