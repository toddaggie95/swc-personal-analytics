import{createPublicKey,randomUUID}from'node:crypto';import{readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync}from'node:fs';import{join}from'node:path';
import{loadConfig,requireLive}from'../../src/config/index.js';import{loadAuth,validToken}from'../../src/auth/session.js';import{withLock,readJson}from'../../src/storage/files.js';
import{sealJson,openJson}from'./private-json-artifact.mjs';import{unwrap,uid}from'./capability-pilot.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';import{planFleetPages}from'./fleet-pages.mjs';
async function main(){
 const cfg=loadConfig();requireLive(cfg);const output=process.env.SWC_CAPTURE_OUTPUT!;if(!output)throw Error('output');mkdirSync(output,{recursive:true,mode:0o700});
 const archiveKey=createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!),analysisKey=readFileSync(process.env.SWC_CAPTURE_ANALYSIS_PUBLIC_KEY!,'utf8');
 const save=async(name:string,value:unknown)=>{for(const[recipient,key]of[['archive',archiveKey],['analysis',analysisKey]]as const)writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(value,key)),{mode:0o600});};
 await withLock(cfg.privateDir,async()=>{
  const auth=await loadAuth(cfg);await auth.accessToken();const token=await readJson(join(cfg.privateDir,'tokens.json'));if(!validToken(token))throw Error('token');if(token.expiresAt<Date.now()+45*60000)await auth.refresh();
  const runId=randomUUID(),deadline=Date.now()+8*60000,transport=makeCaptureTransport({auth,pacer:await newPacer(deadline),save,phase:runId+'-plan',limit:20,deadline});
  try{
   const r=await transport.read('character/');if(r.status!==200)throw Error('character-http');const me=unwrap(r.body);if(!/^1:\d+$/.test(uid(me)))throw Error('character-identity');
   const factions=(Array.isArray(me.factions)?me.factions:[]).filter((f:any)=>typeof f.value==='string'&&(f.value==='The Faerytail Family'||f.value.startsWith('The Faerytail Family:'))).map((f:any)=>({uid:uid(f),name:f.value,optional:false}));
   if(!factions.some((f:any)=>f.name==='The Faerytail Family')||new Set(factions.map((f:any)=>f.uid)).size!==factions.length)throw Error('faction-coverage');
   const seedPath=process.env.SWC_SURVEY_SEED_SNAPSHOT;
   if(seedPath&&existsSync(seedPath)){const s=openJson(JSON.parse(readFileSync(seedPath,'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY);
    for(const f of s.byOwner??[])if(/^20:\d+$/.test(f.uid)&&typeof f.name==='string'&&f.name.startsWith('The Faerytail Family:')&&!factions.some((x:any)=>x.uid===f.uid))factions.push({uid:f.uid,name:f.name,optional:true});}
   const {plan,inventories}=await planFleetPages(transport.read,factions,{runId,analysisPublicKey:analysisKey});
   await save('fleet-page-plan',plan);await save('fleet-page-seeds',inventories);
   appendFileSync(process.env.GITHUB_OUTPUT!,'matrix='+JSON.stringify({include:plan.batches.map((b:any)=>({id:b.id}))})+'\nhas_batches='+String(plan.batches.length>0)+'\n');
  }finally{await save('fleet-plan-telemetry',transport.summary());}
 });console.log('Bounded actual owner inventory page plan sealed.');
}
main().catch(()=>{console.error('Owner page planning stopped; encrypted diagnostics retained. No credential retry.');process.exitCode=1;});
