import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {encrypt} from '../api-parity/private-audit-envelope.mjs';
import {checkAccess} from './check-expanded-access.mjs';
async function main(){
 const token=JSON.parse(process.env.SWC_OAUTH_TOKENS_JSON);
 if(typeof token.accessToken!=='string'||!token.accessToken||!Number.isFinite(token.expiresAt)||token.expiresAt<Date.now()+300000)throw Error('access-only lifetime');
 const key=readFileSync('tools/planet-api/inspection-public-key.pem'),output=process.env.RUNNER_TEMP+'/expanded-access';
 mkdirSync(output,{recursive:true,mode:0o700});let count=0,last=0;
 const save=(name,data)=>writeFileSync(join(output,name+'.encrypted.json'),JSON.stringify(encrypt(Buffer.from(JSON.stringify(data)),key)),{mode:0o600});
 const request=async(endpoint,query)=>{
  if(count>=7||!(/^(character\/(1:\d+\/permissions)?|inventory\/(20:\d+\/(facilities|cities|planets)\/owner|1:\d+\/planets\/pilot|cities\/7:\d+))$/.test(endpoint)))throw Error('endpoint-bound');
  const delay=Math.max(0,last+6500-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));
  last=Date.now();count++;const url=new URL(endpoint,'https://www.swcombine.com/ws/v2.0/');
  for(const[k,v]of Object.entries(query))url.searchParams.set(k,String(v));
  const r=await fetch(url,{method:'GET',headers:{Accept:'application/json',Authorization:'OAuth '+token.accessToken},redirect:'error',signal:AbortSignal.timeout(30000)});
  const body=await r.text();save('response-'+count,{endpoint,query,status:r.status,observedAt:new Date().toISOString(),body});
  return {status:r.status,body:JSON.parse(body)};
 };
 await checkAccess(request,r=>save('report',r));
 console.log('Expanded-access evidence captured; payloads encrypted, no refresh or rejected planet-detail retry.');
}
main().catch(()=>{console.error('Expanded access check stopped; private details suppressed.');process.exitCode=1;});
