import {createPublicKey, randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadConfig,requireLive,API_BASE} from '../../src/config/index.js';
import {loadAuth} from '../../src/auth/session.js';
import {withLock} from '../../src/storage/files.js';
import {encrypt} from '../api-parity/private-audit-envelope.mjs';
import {collectPilot,collectCityPilot,allowedEndpoint} from './capability-pilot.mjs';

async function main(){
 const config=loadConfig();requireLive(config);
 const key=process.env.SWC_PILOT_PUBLIC_KEY_FILE
  ? createPublicKey(await readFile(process.env.SWC_PILOT_PUBLIC_KEY_FILE))
  : createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY!);
 const output=process.env.SWC_PILOT_OUTPUT!;
 if(!output)throw Error('output');
 await mkdir(output,{recursive:true,mode:0o700});
 const runId=randomUUID();let count=0,last=0;
 const started=Date.now();
 const save=async(name:string,data:unknown)=>writeFile(join(output,name+'.encrypted.json'),
  JSON.stringify(encrypt(Buffer.from(JSON.stringify({runId,data})),key)),{mode:0o600});
 await withLock(config.privateDir,async()=>{
  const auth=await loadAuth(config);
  const request=async(endpoint:string,query:Record<string,string|number>)=>{
   if(!allowedEndpoint(endpoint)||count>=18||Date.now()-started>240000)throw Error('bound');
   const delay=Math.max(0,last+6500-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));
   const token=await auth.accessToken();
   const url=new URL(endpoint,API_BASE);for(const [k,v]of Object.entries(query))url.searchParams.set(k,String(v));
   count++;last=Date.now();
   const response=await fetch(url,{method:'GET',headers:{Accept:'application/json',Authorization:'OAuth '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
   // Never snapshot headers or OAuth exchanges. Data responses remain encrypted.
   const bytes=Buffer.from(await response.arrayBuffer());
   await save('response-'+String(count).padStart(3,'0'),{endpoint,query,status:response.status,observedAt:new Date().toISOString(),body:bytes.toString('utf8')});
   if(bytes.length>8*1024*1024)throw Error('response-size');
   let body;try{body=JSON.parse(bytes.toString('utf8'));}catch{throw Error('non-json');}
   return {status:response.status,body};
  };
  const saveReport=(report:unknown)=>save('capability-report',report);
  if(process.env.SWC_PILOT_CITY_UID)await collectCityPilot(request,{cityUid:process.env.SWC_PILOT_CITY_UID,save:saveReport});
  else await collectPilot(request,{planetName:process.env.SWC_PILOT_PLANET||'Chamble I',factionName:'The Faerytail Family',save:saveReport});
 });
 console.log('Read-only capability pilot completed; all data and field evidence encrypted.');
}
main().catch(()=>{console.error('Read-only capability pilot stopped; private details suppressed. Do not retry unchanged credentials.');process.exitCode=1;});
