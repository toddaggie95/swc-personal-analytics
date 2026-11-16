import {createPublicKey,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadConfig,requireLive} from '../../src/config/index.js';
import {loadAuth,validToken} from '../../src/auth/session.js';
import {withLock,readJson} from '../../src/storage/files.js';
import {encrypt} from '../api-parity/private-audit-envelope.mjs';
import {unwrap,uid,record} from './capability-pilot.mjs';
import {newPacer,makeCaptureTransport} from './capture-transport.mjs';
import {fullInventory,fullTypeIndex,makeCapturePlan} from './planet-capture.mjs';
async function main(){
 const cfg=loadConfig();requireLive(cfg);
 const planetName=process.env.SWC_CAPTURE_PLANET||'Chamble I';
 if(!/^[A-Za-z0-9 .'-]{1,100}$/.test(planetName))throw Error('planet-name');
 const output=process.env.SWC_CAPTURE_OUTPUT!;if(!output)throw Error('output');mkdirSync(output,{recursive:true,mode:0o700});
 const archiveKey=createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!),analysisPublicKey=readFileSync(process.env.SWC_CAPTURE_ANALYSIS_PUBLIC_KEY!,'utf8');
 const save=async(name:string,data:unknown)=>{
  const bytes=Buffer.from(JSON.stringify(data));
  for(const [recipient,key]of [['archive',archiveKey],['analysis',analysisPublicKey]]as const)
   writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(encrypt(bytes,key)),{mode:0o600});
 };
 await withLock(cfg.privateDir,async()=>{
  const auth=await loadAuth(cfg);await auth.accessToken();
  const token=await readJson(join(cfg.privateDir,'tokens.json'));if(!validToken(token))throw Error('token');if(token.expiresAt<Date.now()+45*60000)await auth.refresh();
  const runId=randomUUID(),deadline=Date.now()+8*60000,pacer=await newPacer(deadline);
  const transport=makeCaptureTransport({auth,pacer,save,phase:runId+'-plan',limit:50,deadline});
  const inventory:any={schemaVersion:1,runId,createdAt:new Date().toISOString(),inventories:[],sources:transport.sources,status:'collecting'};
  try{
   const meResponse=await transport.read('character/');if(meResponse.status!==200)throw Error('character-http');const me=unwrap(meResponse.body);
   if(!/^1:\d+$/.test(uid(me)))throw Error('character-identity');
   const factions=(Array.isArray(me.factions)?me.factions:[]).filter((f:any)=>typeof f.value==='string'&&(f.value==='The Faerytail Family'||f.value.startsWith('The Faerytail Family:')));
   if(!factions.some((f:any)=>f.value==='The Faerytail Family'))throw Error('faction-coverage');
   const ids=new Set();for(const f of factions){if(!/^20:\d+$/.test(uid(f))||ids.has(uid(f)))throw Error('faction-identity');ids.add(uid(f));}
   inventory.factions=factions.map((f:any)=>({uid:uid(f),name:f.value}));
   const response=await transport.read('galaxy/planets/'+encodeURIComponent(planetName)+'/');if(response.status!==200)throw Error('planet-http');
   const planet=unwrap(response.body);if(!/^8:\d+$/.test(uid(planet))||planet.name?.toLowerCase()!==planetName.toLowerCase())throw Error('planet-identity');inventory.planet=planet;
   for(const faction of inventory.factions)for(const kind of ['facilities','cities'])
    inventory.inventories.push(await fullInventory(transport.read,{ownerUid:faction.uid,planetUid:uid(planet),kind}));
   inventory.typeIndex=await fullTypeIndex(transport.read);inventory.status='complete';
   const plan=makeCapturePlan(inventory,{runId,analysisPublicKey});await save('worker-plan',plan);
   appendFileSync(process.env.GITHUB_OUTPUT!,'matrix='+JSON.stringify({include:plan.batches.map((b:any)=>({id:b.id}))})+'\n');
  }finally{await save('inventory',inventory);await save('plan-telemetry',transport.summary());}
 });
 console.log('Planet inventory plan sealed; all raw observations encrypted.');
}
main().catch(()=>{console.error('Planet inventory planning stopped; encrypted diagnostics retained. No unchanged-credential retry.');process.exitCode=1;});
