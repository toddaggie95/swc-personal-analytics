import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth,validToken} from '../../src/auth/session.js';
import {ReadClient} from '../../src/swc/read-client.js';
import {ReadPacer} from '../../src/swc/read-pacer.js';
import {SnapshotRun} from '../../src/storage/snapshots.js';
import {syncFactionStations,syncFactionMaterials} from '../../src/swc/sync.js';
import {readJson,atomicWrite,withLock} from '../../src/storage/files.js';
import {productionState} from './production-contract.mjs';
import {makePlan,selectBatch} from './production-batches.mjs';
import {failureCategory} from './collection-diagnostics.mjs';
import {encrypt,decrypt} from './private-audit-envelope.mjs';
import {createPublicKey} from 'node:crypto';
import {readFileSync,existsSync,mkdirSync,appendFileSync} from 'node:fs';
import {join,basename} from 'node:path';

let phase='configuration',details=0;
let inventory: {faction:string, kind:string, started:number} | undefined;
const inventoryResponses: Record<number,number> = {};
const inventoryTransport: typeof fetch = async (...args) => {
 const response=await fetch(...args);
 inventoryResponses[response.status]=(inventoryResponses[response.status]??0)+1;
 return response;
};
const contract=()=>readFileSync(new URL('./production-contract.mjs',import.meta.url));
const output=process.env.SWC_BATCH_OUTPUT!;
const key=()=>{if(!process.env.SWC_API_SNAPSHOT_PRIVATE_KEY)throw Error('Checkpoint encryption unavailable');return process.env.SWC_API_SNAPSHOT_PRIVATE_KEY;};
async function seal(file:string,value:unknown){mkdirSync(output,{recursive:true});await atomicWrite(join(output,file),JSON.stringify(encrypt(Buffer.from(JSON.stringify(value)),createPublicKey(key()))));}
function open(file:string){return JSON.parse(decrypt(JSON.parse(readFileSync(file,'utf8')),key()));}

async function coordinator(){
 const cfg=loadConfig();requireLive(cfg);key();
 await withLock(cfg.privateDir,async()=>{
  phase='coordinator-auth';const auth=await loadAuth(cfg);await auth.accessToken();
  const token=await readJson(join(cfg.privateDir,'tokens.json'));
  if(!validToken(token))throw Error('Invalid coordinator token');
  if(token.expiresAt<Date.now()+45*60_000)await auth.refresh();
  const pacer=new ReadPacer(undefined,undefined,6500,12*60_000,1000,Date.now()+12*60_000);
  const client=new ReadClient(auth,new SnapshotRun(cfg.privateDir,'production_batch_plan'),inventoryTransport,undefined,pacer);
  const me=client.me.bind(client);let character:ReturnType<typeof me>|undefined;client.me=()=>character??=me();
  const documents=[];
  for(const faction of ['tff','tjo'] as const){
   for(const kind of ['stations','materials']){
    phase='coordinator-inventory';
    inventory={faction,kind,started:Date.now()};
    const run=new SnapshotRun(cfg.privateDir,kind+'_'+faction);
    const inv=kind==='stations'?await syncFactionStations(client,run,cfg.privateDir,faction,false):await syncFactionMaterials(client,run,cfg.privateDir,faction);
    documents.push({name:basename(inv.exportFile),faction,doc:await readJson(inv.exportFile)});
   }
  }
  inventory=undefined;
  // Refresh only in this coordinator, after inventory work, if workers need a longer window.
  const current=await readJson(join(cfg.privateDir,'tokens.json'));
  if(!validToken(current))throw Error('Invalid coordinator token');
  if(current.expiresAt<Date.now()+45*60_000)await auth.refresh();
  const registry=JSON.parse(readFileSync(process.env.SWC_SYSTEMS_FILE!,'utf8'));
  const progress=join(cfg.privateDir,'production-progress.json');
  phase='checkpoint-validation';
  const plan=makePlan(documents,registry.systems.map((s:{system:string})=>s.system),contract(),existsSync(progress)?await readJson(progress):null);
  await seal('plan.encrypted.json',plan);
  appendFileSync(process.env.GITHUB_OUTPUT!,'matrix='+JSON.stringify({include:plan.batches.map((b:{id:string})=>({id:b.id}))})+'\n');
  console.log('PRODUCTION_API_PLAN '+JSON.stringify({batches:plan.batches.length,reused:plan.progress.entries.length,targets:plan.progress.entries.length+plan.batches.reduce((n:number,b:{stations:unknown[]})=>n+b.stations.length,0)}));
 });
}
async function worker(){
 const cfg=loadConfig();
 if(process.env.GITHUB_ACTIONS!=='true'||!cfg.activated||!cfg.regenerated)throw Error('Hosted read-only worker guard');
 const plan=open(process.env.SWC_BATCH_PLAN!),batch=selectBatch(plan,process.env.SWC_BATCH_ID,contract());
 const result={id:batch.id,identity:plan.identity,entries:[] as unknown[]};
 const started=Date.now();let requests=0;
 const pacer=new ReadPacer(undefined,undefined,6500,60_000,1000,Date.now()+8*60_000);
 try{
  phase='worker-access-token';const token=await readJson(join(cfg.privateDir,'tokens.json'));
  if(!validToken(token)||token.refreshToken||token.expiresAt<Date.now()+15*60_000)throw Error('Worker token lifetime/refresh guard');
  // No OAuth SDK client or refresh route exists in a worker.
  const auth={async accessToken(){if(token.expiresAt<Date.now()+5*60_000)throw Error('Worker token nearing expiry');return token.accessToken;},async refresh(){throw Error('Worker refresh forbidden');}};
  const transport:typeof fetch=async(...args)=>{requests++;return fetch(...args);};
  const client=new ReadClient(auth,new SnapshotRun(cfg.privateDir,'production_batch'),transport,undefined,pacer);
  for(const station of batch.stations){
   phase='station-read';const detail=await client.stationDetail(station.uid);
   phase='station-contract';
   if(detail.uid!==station.uid||(detail.owner as any)?.attributes?.uid!==station.ownerUid)throw Error('Station identity/ownership changed');
   result.entries.push({uid:station.uid,ownerUid:station.ownerUid,operations:productionState(detail)});details++;
   // Fifty-read bounds keep each fresh runner comfortably inside its observed quota.
   if(details%25===0)await seal('batch-'+batch.id+'.encrypted.json',result);
  }
 }finally{
  await seal('batch-'+batch.id+'.encrypted.json',result);
  console.log('PRODUCTION_API_BATCH '+JSON.stringify({batch:batch.id,details,requests,elapsedMs:Date.now()-started,...pacer.summary()}));
 }
}
const mode=process.argv[2];
(mode==='plan'?coordinator():mode==='worker'?worker():Promise.reject(Error('Unknown batch mode'))).catch(error=>{console.error('PRODUCTION_API_FAILURE '+JSON.stringify({phase,details,category:failureCategory(error,phase),...(inventory&&{
 faction:inventory.faction,kind:inventory.kind,elapsedMs:Date.now()-inventory.started,httpResponses:inventoryResponses
 })}));process.exitCode=1;});
