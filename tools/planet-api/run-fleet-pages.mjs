import{readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync}from'node:fs';import{join}from'node:path';import{createPublicKey,randomUUID}from'node:crypto';
import{sealJson,openJson}from'./private-json-artifact.mjs';import{collectFleetPages,assembleFleetPages,verifyFleetPlan}from'./fleet-pages.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';
const open=p=>openJson(JSON.parse(readFileSync(p,'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY);
const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(join(p,d.name)):[join(p,d.name)]);
async function main(){
 const[mode,...args]=process.argv.slice(2);const output=process.env.SWC_CAPTURE_OUTPUT||args[2];if(!output)throw Error('output');mkdirSync(output,{recursive:true,mode:0o700});
 const plan=verifyFleetPlan(open(mode==='worker'?process.env.SWC_CAPTURE_PLAN:join(args[0],'fleet-page-plan.archive.encrypted.json')));
 const save=async(name,value)=>{for(const[recipient,key]of[['archive',createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY)],['analysis',plan.analysisPublicKey]])writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(value,key)),{mode:0o600});};
 if(mode==='worker'){
  const token=JSON.parse(readFileSync(process.env.SWC_ACCESS_TOKEN_FILE,'utf8'));if(!token.accessToken||token.refreshToken||!Number.isFinite(token.expiresAt)||token.expiresAt<Date.now()+15*60000)throw Error('access-lifetime');
  const auth={async accessToken(){if(token.expiresAt<Date.now()+5*60000)throw Error('access-expiry');return token.accessToken;}};
  const resume=process.env.SWC_FLEET_RESUME_BATCH?open(process.env.SWC_FLEET_RESUME_BATCH):null;
  const deadline=Date.now()+6*60000,id=process.env.SWC_CAPTURE_BATCH,transport=makeCaptureTransport({auth,pacer:await newPacer(deadline),save,phase:plan.runId+'-'+id+(resume?'-resume-'+randomUUID():''),limit:25,deadline});
  try{await collectFleetPages(transport.read,plan,id,r=>save('batch-'+id,r),resume);}finally{await save('telemetry-'+id,transport.summary());}
 }else if(mode==='assemble'){
  const seeds=open(join(args[0],'fleet-page-seeds.archive.encrypted.json'));let batches=files(args[1]).filter(p=>/batch-pages-\d{3}\.archive\.encrypted\.json$/.test(p)).map(open);
  if(process.env.SWC_FLEET_REPLACEMENT_DIR){const replacements=files(process.env.SWC_FLEET_REPLACEMENT_DIR).filter(p=>/batch-pages-\d{3}\.archive\.encrypted\.json$/.test(p)).map(open);
   for(const replacement of replacements){const original=batches.find(b=>b.id===replacement.id);if(!original||original.complete||!replacement.complete||replacement.parentPartialSha256!==(await import('./planet-capture.mjs')).hash(original))throw Error('replacement-provenance');batches=batches.filter(b=>b.id!==replacement.id);batches.push(replacement);}
  }
  const result=assembleFleetPages(plan,seeds,batches);await save('fleet-owner-inventory',result.inventory);await save('fleet-index',result.index);
 }else throw Error('mode');
 console.log('Bounded owner page evidence sealed; private contents encrypted.');
}
main().catch(()=>{console.error('Owner page collection/assembly stopped; partial encrypted evidence retained. No automatic retries.');process.exitCode=1;});
