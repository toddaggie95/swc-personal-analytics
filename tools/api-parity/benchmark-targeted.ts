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
for(const faction of ['tjo'] as const){
 const run=new SnapshotRun(config.privateDir,'daluuj-targeted-'+faction);
 const inv=await syncFactionStations(client,run,config.privateDir,faction,false,{kind:'system',name:system});
 const list=(await readJson(inv.exportFile) as {stations:Array<Record<string,unknown>>}).stations;
 const ids=['5:37746','5:19046','5:19047'];
 for(const uid of ids){
  const station=list.find(s=>String(s.uid)===uid);
  if(!station){console.log(JSON.stringify({phase:'targeted-detail',uid,presentInInventory:false}));continue;}
  const detail=await client.stationDetail(uid);
  const ops=stationOperations(detail);
  const actions=Array.isArray(ops.actions)?ops.actions:[];
  const describe=(value:unknown):Record<string,unknown>=>{
    const r=obj(value);
    const attrs=obj(r.attributes);
    const safeKeys=['type','status','state','active','paused','progress','percent','percentage','remaining','duration','timeleft','time_left','starttime','endtime'];
    const safe=(source:Record<string,unknown>)=>Object.fromEntries(Object.entries(source).filter(([k,v])=>safeKeys.includes(k.toLowerCase())&&(typeof v==='string'||typeof v==='number'||typeof v==='boolean')).map(([k,v])=>[k,typeof v==='string'?v.slice(0,80):v]));
    return {keys:Object.keys(r).sort(),attributeKeys:Object.keys(attrs).sort(),safeValues:safe(r),safeAttributes:safe(attrs),
      nestedShapes:Object.fromEntries(Object.entries(r).filter(([k,v])=>k!=='attributes'&&v!==null&&typeof v==='object').map(([k,v])=>[k,Array.isArray(v)?{kind:'array',count:v.length}:{kind:'object',keys:Object.keys(obj(v)).sort()}]))};
  };
  console.log(JSON.stringify({phase:'targeted-action-shapes',uid,actions:actions.map(describe),queueItemShapes:(ops.queueItems??[]).slice(0,4).map(describe)}));
  console.log(JSON.stringify({phase:'targeted-detail',uid,stationType:station.typeName,
    actionTypes:actions.map(a=>String(obj(obj(a).attributes).type??'unknown')),
    actionCount:ops.actions?.length??null,productionActionCount:ops.productionActions?.length??null,
    actionsFieldPresent:'actions' in detail,queueCount:ops.queueItems?.length??null,
    toolingPresent:ops.tooledTo!==null,
    operationFieldNames:Object.keys(detail).filter(k=>/action|queue|tool|produc|retool|status|working/i.test(k))
  }));
 }
}
