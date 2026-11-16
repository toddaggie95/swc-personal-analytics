import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {join} from 'node:path';import{createPublicKey}from'node:crypto';
import{encrypt,decrypt}from'../api-parity/private-audit-envelope.mjs';
import{verifyPlan,collectBatch}from'./planet-capture.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';
async function main(){
 const key=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY;
 const plan=verifyPlan(JSON.parse(decrypt(JSON.parse(readFileSync(process.env.SWC_CAPTURE_PLAN,'utf8')),key)));
 const id=process.env.SWC_CAPTURE_BATCH,output=process.env.SWC_CAPTURE_OUTPUT;
 if(!plan.batches.some(b=>b.id===id)||!output)throw Error('batch');mkdirSync(output,{recursive:true,mode:0o700});
 const token=JSON.parse(readFileSync(process.env.SWC_ACCESS_TOKEN_FILE,'utf8'));
 if(!token.accessToken||token.refreshToken||!Number.isFinite(token.expiresAt)||token.expiresAt<Date.now()+15*60000)throw Error('worker-access-lifetime');
 // No OAuth SDK, client secret or refresh implementation exists in a worker.
 const auth={async accessToken(){if(token.expiresAt<Date.now()+5*60000)throw Error('worker-expiry');return token.accessToken;}};
 const archiveKey=createPublicKey(key),save=async(name,data)=>{const bytes=Buffer.from(JSON.stringify(data));
  for(const[recipient,k]of[['archive',archiveKey],['analysis',plan.analysisPublicKey]])writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(encrypt(bytes,k)),{mode:0o600});};
 const deadline=Date.now()+6*60000,pacer=await newPacer(deadline),transport=makeCaptureTransport({auth,pacer,save,phase:plan.runId+'-'+id,limit:25,deadline});
 try{await collectBatch(transport.read,plan,id,result=>save('batch-'+id,result));}
 finally{await save('telemetry-'+id,transport.summary());}
 console.log('Bounded planet detail batch sealed; observations encrypted.');
}
main().catch(()=>{console.error('Planet detail batch stopped; encrypted partial evidence retained.');process.exitCode=1;});
