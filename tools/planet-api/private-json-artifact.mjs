import{gzipSync,gunzipSync}from'node:zlib';import{encrypt,decrypt}from'../api-parity/private-audit-envelope.mjs';
export function sealJson(value,key){return{...encrypt(gzipSync(Buffer.from(JSON.stringify(value))),key),payloadEncoding:'json+gzip-v1'};}
export function openJson(envelope,key){
 const bytes=decrypt(envelope,key);
 if(envelope.payloadEncoding!=null&&envelope.payloadEncoding!=='json+gzip-v1')throw Error('artifact-encoding');
 return JSON.parse((envelope.payloadEncoding?gunzipSync(bytes,{maxOutputLength:1024*1024*1024}):bytes).toString('utf8'));
}
