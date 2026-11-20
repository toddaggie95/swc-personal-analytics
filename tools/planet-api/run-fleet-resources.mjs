import{readFileSync,writeFileSync,mkdirSync,readdirSync}from'node:fs';import{join}from'node:path';import{createPublicKey}from'node:crypto';
import{sealJson,openJson}from'./private-json-artifact.mjs';import{collectResourceBatch,assembleResources,verifyResourcePlan}from'./fleet-resources.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';
const open=p=>openJson(JSON.parse(readFileSync(p,'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY);
const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(join(p,d.name)):[join(p,d.name)]);
async function main(){
 const[mode,...args]=process.argv.slice(2),output=process.env.SWC_CAPTURE_OUTPUT||args[2];if(!output)throw Error('output');mkdirSync(output,{recursive:true,mode:0o700});
 const plan=verifyResourcePlan(open(mode==='worker'?process.env.SWC_CAPTURE_PLAN:join(args[0],'resource-plan.archive.encrypted.json')));
 const save=async(name,value)=>{for(const[recipient,key]of[['archive',createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY)],['analysis',plan.analysisPublicKey]])writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(value,key)),{mode:0o600});};
 if(mode==='worker'){
  const token=JSON.parse(readFileSync(process.env.SWC_ACCESS_TOKEN_FILE,'utf8'));if(!token.accessToken||token.refreshToken||!Number.isFinite(token.expiresAt)||token.expiresAt<Date.now()+15*60000)throw Error('resource-access-lifetime');
  const auth={async accessToken(){if(token.expiresAt<Date.now()+5*60000)throw Error('resource-access-expiry');return token.accessToken;}},id=process.env.SWC_CAPTURE_BATCH,deadline=Date.now()+10*60000;
  const transport=makeCaptureTransport({auth,pacer:await newPacer(deadline),save,phase:plan.runId+'-'+id,limit:80,deadline});
  try{await collectResourceBatch(transport.read,plan,id,r=>save('batch-'+id,r));}finally{await save('telemetry-'+id,transport.summary());}
 }else if(mode==='assemble'){
  const batches=files(args[1]).filter(p=>/batch-resource-\d{3}\.archive\.encrypted\.json$/.test(p)).map(open);await save('resources',assembleResources(plan,batches));
 }else throw Error('mode');console.log('Private resource observations sealed with explicit per-target coverage.');
}
main().catch(()=>{console.error('Resource worker stopped; partial observations retained, no automatic credential retry.');process.exitCode=1;});
