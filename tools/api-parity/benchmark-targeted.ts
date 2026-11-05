import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations} from '../../src/swc/sync.js';
import {readJson} from '../../src/storage/files.js';
import {stationOperations} from '../../src/swc/enrich-stations.js';
const system=process.env.TARGET_SYSTEM||'Daluuj';
const config=loadConfig();requireLive(config);
const client=new ReadClient(await loadAuth(config),new SnapshotRun(config.privateDir,'daluuj-activity'));
const get=(client as unknown as {get:(endpoint:string,query:Record<string,string|number>)=>Promise<Record<string,unknown>>}).get.bind(client);
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const values=(x:unknown)=>{const v=obj(x);return Array.isArray(v.entity)?v.entity as Record<string,unknown>[]:[]};
for(const faction of ['tjo','tff'] as const){
 const run=new SnapshotRun(config.privateDir,'daluuj-'+faction);
 const inv=await syncFactionStations(client,run,config.privateDir,faction,false,{kind:'system',name:system});
 const list=(await readJson(inv.exportFile) as {stations:Array<Record<string,unknown>>}).stations;
 const base={start_index:1,item_count:200,'filter_type[0]':'system','filter_value[0]':String(inv.locationFilter?.uid??''),'filter_inclusion[0]':'includes'};
 const uidSet=new Set(list.map(s=>String(s.uid)));
 const states:Record<string,string[]>={};
 const totals:Record<string,number>={};
 for(const [name,flag] of [['working',1],['idle',0]] as const){
  const res=await get('inventory/'+inv.ownerUid+'/stations/owner',{...base,'filter_type[1]':'working','filter_value[1]':flag,'filter_inclusion[1]':'includes'});
  const entities=obj(res.entities);
  const uids=values(entities).map(r=>String(obj(r.value).uid??r.uid??''));
  states[name]=uids;totals[name]=Number(obj(entities.attributes).total??uids.length);
 }
 const active=new Set(states.working),idle=new Set(states.idle);
 const typeCounts=(uids:string[])=>uids.reduce((a,uid)=>{const s=list.find(x=>String(x.uid)===uid);const t=String(s?.typeName??'unknown');a[t]=(a[t]??0)+1;return a;},{} as Record<string,number>);
 console.log(JSON.stringify({phase:'daluuj-inventory',system,faction,total:list.length,working:totals.working,idle:totals.idle,overlap:states.working.filter(u=>idle.has(u)).length,unclassified:[...uidSet].filter(u=>!active.has(u)&&!idle.has(u)).length,workingTypes:typeCounts(states.working),idleTypes:typeCounts(states.idle)}));
 // Deterministic small sample of working and idle shipyards and non-shipyards.
 const categories=[['working-shipyard',true,true],['working-other',true,false],['idle-shipyard',false,true],['idle-other',false,false]] as const;
 const sample:Record<string,unknown>[]=[];
 for(const [label,isWorking,isShipyard] of categories){
  const candidates=list.filter(s=>active.has(String(s.uid))===isWorking&&/shipyard/i.test(String(s.typeName))===isShipyard);
  for(const s of candidates.slice(0,2)){
   const detail=await client.stationDetail(String(s.uid));
   const ops=stationOperations(detail);
   const actions=Array.isArray(ops.actions)?ops.actions:[];
   sample.push({category:label,uid:s.uid,type:s.typeName,working:active.has(String(s.uid)),toolingPresent:ops.tooledTo!==null,toolingType:typeof ops.tooledTo,queueCount:ops.queueItems?.length??null,actionsFieldPresent:'actions' in detail,actionTypes:actions.map(a=>String(obj(obj(a).attributes).type??'unknown')),productionActionCount:ops.productionActions?.length??null,detailKeys:Object.keys(detail).filter(k=>/action|queue|tool|produc|retool|status|working/i.test(k))});
  }
 }
 console.log(JSON.stringify({phase:'daluuj-details',system,faction,sample}));
}
