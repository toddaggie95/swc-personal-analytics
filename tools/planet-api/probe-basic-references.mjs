import{readFileSync,readdirSync,writeFileSync,mkdirSync}from'node:fs';import{join}from'node:path';import{createPublicKey}from'node:crypto';
import{encrypt,decrypt}from'../api-parity/private-audit-envelope.mjs';import{uid}from'./capability-pilot.mjs';import{newPacer,makeCaptureTransport}from'./capture-transport.mjs';
function files(root){return readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(root,e.name)):[join(root,e.name)]);}
async function main(){
 const archivePrivate=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY,archivePublic=createPublicKey(archivePrivate),analysisPublic=readFileSync('tools/planet-api/snapshot-analysis-public-key.pem');
 const batches=files(process.env.SWC_CAPTURE_SAVED_CITIES).filter(p=>/batch-cities-\d{3}\.archive\.encrypted\.json$/.test(p)).map(p=>JSON.parse(decrypt(JSON.parse(readFileSync(p)),archivePrivate)));
 const basic=batches.flatMap(b=>b.entries.filter(e=>e.status==='observed').flatMap(e=>e.data.buildings?.building??[])).filter(r=>/^4:\d+$/.test(uid(r))&&(!uid(r.type)||!uid(r.owner)));
 const targets=[];
 for(const pattern of [/\/facilities\/7\//,/\/facilities\/36\//,null]){
  const target=basic.find(r=>!targets.some(t=>t.uid===uid(r))&&(!pattern||pattern.test(r.images?.small??'')));
  if(target)targets.push({uid:uid(target)});
 }
 const token=JSON.parse(process.env.SWC_OAUTH_TOKENS_JSON);if(typeof token.accessToken!=='string'||!token.accessToken||!Number.isFinite(token.expiresAt)||token.expiresAt<Date.now()+600000)throw Error('access-lifetime');
 delete process.env.SWC_OAUTH_TOKENS_JSON;
 const output=process.env.RUNNER_TEMP+'/basic-reference-probe';mkdirSync(output,{recursive:true,mode:0o700});
 const save=async(name,value)=>{const bytes=Buffer.from(JSON.stringify(value));for(const [recipient,key]of[['archive',archivePublic],['analysis',analysisPublic]])writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(encrypt(bytes,key)),{mode:0o600});};
 const deadline=Date.now()+90000,pacer=await newPacer(deadline),transport=makeCaptureTransport({auth:{accessToken:async()=>token.accessToken},pacer,save,phase:'basic-reference-probe',limit:3,deadline});
 const results=[];try{for(const target of targets){const r=await transport.read('inventory/facilities/'+target.uid);results.push({uid:target.uid,status:r.status,source:r.source,body:r.body});if(![200,401,403,404].includes(r.status))throw Error('probe-http');}}
 finally{await save('basic-reference-probe',{schemaVersion:1,results,complete:results.length===targets.length});}
 console.log('Three-reference field-availability check retained as encrypted evidence; no refresh or repeated failed UID.');
}
main().catch(()=>{console.error('Basic-reference check stopped; encrypted evidence retained.');process.exitCode=1;});
