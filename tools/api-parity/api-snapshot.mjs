import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPublicKey,generateKeyPairSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {encrypt,decrypt} from './private-audit-envelope.mjs';
const names=['tff-stations.csv','tff-materials.csv','tjo-stations.csv','tjo-materials.csv'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sealSnapshot(directory,publicKey){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'export-manifest.json'),'utf8'));
 const files=names.map(name=>({name,data:fs.readFileSync(path.join(directory,name)).toString('base64')}));
 validate({manifest,files});
 return encrypt(Buffer.from(JSON.stringify({manifest,files})),publicKey);
}
function validate(payload){
 if(payload.manifest?.source!=='api'||payload.manifest.files?.length!==4||payload.files?.length!==4)throw Error('Invalid API snapshot');
 const files=new Map(payload.files.map(f=>[f.name,Buffer.from(f.data,'base64')]));
 if(files.size!==4||names.some(n=>!files.has(n)))throw Error('Invalid snapshot filenames');
 const checked=new Set();
 for(const entry of payload.manifest.files){
  const name=entry.canonicalName;
  if(checked.has(name)||!files.has(name)||hash(files.get(name))!==entry.sha256||entry.id!=='api:'+name.replace('.csv','')+':'+entry.sha256)throw Error('API snapshot hash/identity mismatch');
  checked.add(name);
 }
 return files;
}
export function restoreSnapshot(envelope,privateKey,directory){
 const payload=JSON.parse(decrypt(envelope,privateKey));
 const files=validate(payload);
 fs.mkdirSync(directory,{recursive:true});
 for(const [name,bytes] of files)fs.writeFileSync(path.join(directory,name),bytes,{mode:0o600});
 fs.writeFileSync(path.join(directory,'export-manifest.json'),JSON.stringify(payload.manifest,null,2)+'\n',{mode:0o600});
 return payload.manifest;
}
async function prepareKey(publicPath){
 let key=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY;
 if(!key){
  if(!process.env.SWC_SECRET_WRITER_TOKEN||!process.env.GITHUB_REPOSITORY)throw Error('Snapshot key writer unavailable');
  key=generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
  await new Promise((resolve,reject)=>{
   const child=spawn('gh',['secret','set','SWC_API_SNAPSHOT_PRIVATE_KEY','--repo',process.env.GITHUB_REPOSITORY,'--env','swc-api-shadow'],{env:{...process.env,GH_TOKEN:process.env.SWC_SECRET_WRITER_TOKEN},stdio:['pipe','ignore','ignore']});
   child.on('error',()=>reject(Error('Snapshot key persistence failed')));child.stdin.on('error',()=>reject(Error('Snapshot key persistence failed')));
   child.on('close',code=>code===0?resolve():reject(Error('Snapshot key persistence failed')));child.stdin.end(key);
  });
 }
 fs.writeFileSync(publicPath,createPublicKey(key).export({type:'spki',format:'pem'}),{mode:0o600});
}
async function main(){
 const [mode,a,b,c]=process.argv.slice(2);
 if(mode==='prepare-key')await prepareKey(a);
 else if(mode==='seal')fs.writeFileSync(c,JSON.stringify(sealSnapshot(a,fs.readFileSync(b))),{mode:0o600});
 else if(mode==='restore'){
  if(!process.env.SWC_API_SNAPSHOT_PRIVATE_KEY)throw Error('Accepted API snapshot key unavailable; refusing CSV substitution');
  restoreSnapshot(JSON.parse(fs.readFileSync(a,'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY,b);
 }else throw Error('Unknown API snapshot operation');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('API snapshot handoff failed. Private diagnostics suppressed.');process.exitCode=1;});
