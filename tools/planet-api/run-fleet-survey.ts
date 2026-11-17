import{createPublicKey,randomUUID}from'node:crypto';import{readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync}from'node:fs';import{join}from'node:path';
import{loadConfig,requireLive}from'../../src/config/index.js';import{loadAuth,validToken}from'../../src/auth/session.js';import{withLock,readJson}from'../../src/storage/files.js';
import{encrypt,decrypt}from'../api-parity/private-audit-envelope.mjs';import{unwrap,uid}from'./capability-pilot.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';
import{surveyOwner,indexFleet,recoverSurveyState}from'./fleet-survey.mjs';import{sealJson,openJson}from'./private-json-artifact.mjs';import{hash}from'./planet-capture.mjs';
async function main(){
 const cfg=loadConfig();requireLive(cfg);const output=process.env.SWC_CAPTURE_OUTPUT!;if(!output)throw Error('output');mkdirSync(output,{recursive:true,mode:0o700});
 const archiveKey=createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!),analysisKey=readFileSync(process.env.SWC_CAPTURE_ANALYSIS_PUBLIC_KEY!,'utf8');
 const save=async(name:string,data:unknown)=>{for(const[recipient,key]of[['archive',archiveKey],['analysis',analysisKey]]as const)writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(data,key)),{mode:0o600});};
 let previous:any=null;
 if(process.env.SWC_SURVEY_RESUME_DIR){
  const dir=process.env.SWC_SURVEY_RESUME_DIR;
  const open=(name:string)=>openJson(JSON.parse(readFileSync(join(dir,name),'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY);
  previous=recoverSurveyState(open('fleet-owner-inventory.archive.encrypted.json'),readdirSync(dir).filter(n=>/^checkpoint-.*\.archive\.encrypted\.json$/.test(n)).map(open));
 }
 await withLock(cfg.privateDir,async()=>{
  const auth=await loadAuth(cfg);await auth.accessToken();const token=await readJson(join(cfg.privateDir,'tokens.json'));if(!validToken(token))throw Error('token');if(token.expiresAt<Date.now()+45*60000)await auth.refresh();
  const limit=Number(process.env.SWC_SURVEY_REQUEST_LIMIT||100);if(!Number.isSafeInteger(limit)||limit<1||limit>650)throw Error('request-limit');
  const runId=randomUUID(),deadline=Date.now()+65*60000,transport=makeCaptureTransport({auth,pacer:await newPacer(deadline),save,phase:runId+'-survey',limit,deadline});
  const result:any={schemaVersion:1,runId,createdAt:new Date().toISOString(),status:'collecting',inventories:[],sources:transport.sources};
  try{
   const r=await transport.read('character/');if(r.status!==200)throw Error('character-http');const me=unwrap(r.body);if(!/^1:\d+$/.test(uid(me)))throw Error('character-identity');
   const factions=(Array.isArray(me.factions)?me.factions:[]).filter((f:any)=>typeof f.value==='string'&&(f.value==='The Faerytail Family'||f.value.startsWith('The Faerytail Family:')));
   if(!factions.some((f:any)=>f.value==='The Faerytail Family')||new Set(factions.map((f:any)=>uid(f))).size!==factions.length)throw Error('faction-coverage');
   result.factions=factions.map((f:any)=>({uid:uid(f),name:f.value,optional:false}));
   if(previous){result.parentSurveySha256=hash(previous);result.previousRunIds=[...(previous.previousRunIds??[]),previous.runId];result.createdAt=previous.createdAt;}
   if(process.env.SWC_SURVEY_SEED_SNAPSHOT&&existsSync(process.env.SWC_SURVEY_SEED_SNAPSHOT)){
    const seed=openJson(JSON.parse(readFileSync(process.env.SWC_SURVEY_SEED_SNAPSHOT,'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY);
    for(const o of seed.byOwner??[])if(/^20:\d+$/.test(o.uid)&&typeof o.name==='string'&&o.name.startsWith('The Faerytail Family:')&&!result.factions.some((f:any)=>f.uid===o.uid))result.factions.push({uid:o.uid,name:o.name,optional:true});
   }
   if(previous)for(const f of previous.factions)if(f.optional&&!result.factions.some((o:any)=>o.uid===f.uid))result.factions.push(f);
   for(const f of result.factions)for(const kind of['facilities','cities']){
    const resume=previous?.inventories.find((d:any)=>d.ownerUid===f.uid&&d.kind===kind);
    const doc=await surveyOwner(transport.read,{ownerUid:f.uid,kind,optional:f.optional,resume},async(progress:any)=>{
     await save('checkpoint-'+f.uid.replace(':','-')+'-'+kind,progress);
    });result.inventories.push(doc);await save('fleet-owner-inventory',result);
   }
   result.status='complete';result.index=indexFleet(result.inventories);await save('fleet-index',result.index);
  }finally{result.completedAt=new Date().toISOString();if(result.status==='collecting')result.status='partial';if(previous)result.sources=[...previous.sources,...transport.sources];await save('fleet-owner-inventory',result);await save('survey-telemetry',transport.summary());}
 });
 console.log('Accessible owner survey sealed. Private data and discovered planet names remain encrypted.');
}
main().catch(()=>{console.error('Owner survey stopped; encrypted checkpoints retained. No unchanged-credential retry.');process.exitCode=1;});
