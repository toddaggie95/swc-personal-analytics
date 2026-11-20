import{createPublicKey,randomUUID}from'node:crypto';import{readFileSync,writeFileSync,mkdirSync,appendFileSync}from'node:fs';import{join}from'node:path';
import{loadConfig,requireLive}from'../../src/config/index.js';import{loadAuth,validToken}from'../../src/auth/session.js';import{withLock,readJson}from'../../src/storage/files.js';
import{sealJson,openJson}from'./private-json-artifact.mjs';import{makeResourcePlan}from'./fleet-resources.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';import{hash}from'./planet-capture.mjs';import{unwrap,uid}from'./capability-pilot.mjs';
async function main(){
 const cfg=loadConfig();requireLive(cfg);const output=process.env.SWC_CAPTURE_OUTPUT!;mkdirSync(output,{recursive:true,mode:0o700});
 const privateKey=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!,archiveKey=createPublicKey(privateKey),analysisKey=readFileSync(process.env.SWC_CAPTURE_ANALYSIS_PUBLIC_KEY!,'utf8');
 const open=(p:string)=>openJson(JSON.parse(readFileSync(p,'utf8')),privateKey);
 const inventory=open(process.env.SWC_OWNER_INVENTORY_SOURCE!),phase=process.env.SWC_RESOURCE_PHASE||'planets',onlyGaps=process.env.SWC_RESOURCE_ONLY_GAPS==='true';let planetEntries:any[]=[],priorResources:any=null;
 if(phase==='cities'||onlyGaps){const resources=open(process.env.SWC_PLANET_RESOURCE_SOURCE!);const{contentSha256,...body}=resources;if(hash(body)!==contentSha256||resources.phase!=='planets'||resources.parentOwnerInventorySha256!==inventory.contentSha256)throw Error('resource-parent');planetEntries=resources.entries;priorResources=resources;}
 const save=async(name:string,value:unknown)=>{for(const[recipient,key]of[['archive',archiveKey],['analysis',analysisKey]]as const)writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(value,key)),{mode:0o600});};
 await withLock(cfg.privateDir,async()=>{
  const auth=await loadAuth(cfg);await auth.accessToken();const token=await readJson(join(cfg.privateDir,'tokens.json'));if(!validToken(token))throw Error('token');if(token.expiresAt<Date.now()+45*60000)await auth.refresh();
  const runId=randomUUID(),deadline=Date.now()+5*60000,transport=makeCaptureTransport({auth,pacer:await newPacer(deadline),save,phase:runId+'-authorization',limit:1,deadline});
  const character=await transport.read('character/');if(character.status!==200||!/^1:\d+$/.test(uid(unwrap(character.body))))throw Error('resource-authorization');
  const plan=makeResourcePlan(inventory,{phase,planetEntries,runId,analysisPublicKey:analysisKey});
  if(onlyGaps){const missing=new Set(planetEntries.filter(e=>e.status!=='observed').map(e=>e.uid));const targets=plan.batches.flatMap(b=>b.targets).filter(t=>missing.has(t.uid));plan.batches=[];for(let i=0;i<targets.length;i+=25)plan.batches.push({id:'resource-'+String(i/25).padStart(3,'0'),targets:targets.slice(i,i+25)});plan.parentResourceSha256=priorResources.contentSha256;}
  plan.authorizationSource=character.source;delete plan.identity;plan.identity=hash(plan);
  await save('resource-plan',plan);appendFileSync(process.env.GITHUB_OUTPUT!,'matrix='+JSON.stringify({include:plan.batches.map((b:any)=>({id:b.id}))})+'\nhas_batches='+String(plan.batches.length>0)+'\n');
 });console.log('Bounded resource plan sealed; no private targets logged.');
}
main().catch(()=>{console.error('Resource planning stopped; private diagnostics retained. No credential retry.');process.exitCode=1;});
