import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
export async function newPacer(deadline){
 const source=readFileSync(new URL('../api-parity/production-read-pacer.ts',import.meta.url),'utf8');
 const module=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source,{mode:'transform'})).toString('base64'));
 return new module.ReadPacer(undefined,undefined,6500,60000,1000,deadline);
}
export function captureEndpoint(endpoint){
 try{if(decodeURIComponent(endpoint).split('/').some(p=>p==='.'||p==='..'))return false;}catch{return false;}
 return endpoint==='character/'||/^galaxy\/planets\/[A-Za-z0-9%._~-]+\/$/.test(endpoint)||
  /^inventory\/20:\d+\/(facilities|cities)\/owner$/.test(endpoint)||/^inventory\/cities\/7:\d+$/.test(endpoint)||
  endpoint==='types/facilities/'||/^types\/facilities\/4:\d+$/.test(endpoint);
}
export function makeCaptureTransport({auth,pacer,save,phase,limit,deadline,fetcher=fetch}){
 let count=0;
 const sources=[];
 const read=async(endpoint,query={})=>{
  if(!captureEndpoint(endpoint)||count>=limit||Date.now()+30000>=deadline)throw Error('request-bound');
  await pacer.beforeRequest('planet-capture');const token=await auth.accessToken();
  const url=new URL(endpoint,'https://www.swcombine.com/ws/v2.0/');for(const[k,v]of Object.entries(query))url.searchParams.set(k,String(v));
  const response=await fetcher(url,{method:'GET',headers:{Accept:'application/json',Authorization:'OAuth '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
  pacer.afterResponse('planet-capture',response.headers);count++;
  const chunks=[];let bytes=0;const reader=response.body?.getReader();
  if(!reader)throw Error('empty-response-stream');
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>8*1024*1024){await reader.cancel();throw Error('response-size');}chunks.push(Buffer.from(part.value));}
  const raw=Buffer.concat(chunks),id=phase+'-'+String(count).padStart(4,'0');
  const source={id,endpoint,query,status:response.status,observedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex')};
  sources.push(source);await save('source-'+id,{source,body:raw.toString('utf8')});
  let body;try{body=JSON.parse(raw);}catch{throw Error('non-json');}
  return {status:response.status,body,source};
 };
 return {read,sources,summary:()=>({requests:count,...pacer.summary()})};
}
