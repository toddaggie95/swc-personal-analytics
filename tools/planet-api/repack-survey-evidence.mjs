import{readFileSync,writeFileSync,mkdirSync,readdirSync}from'node:fs';import{join}from'node:path';import{createPublicKey,createHash}from'node:crypto';
import{sealJson,openJson}from'./private-json-artifact.mjs';
try{
 const[input,output]=process.argv.slice(2);if(!output)throw Error('arguments');mkdirSync(output,{recursive:true,mode:0o700});
 const privateKey=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY,archiveKey=createPublicKey(privateKey),analysisKey=readFileSync(process.env.SWC_CAPTURE_ANALYSIS_PUBLIC_KEY,'utf8');
 const manifest=[];
 for(const name of readdirSync(input).filter(n=>n.endsWith('.archive.encrypted.json'))){
  const bytes=readFileSync(join(input,name)),value=openJson(JSON.parse(bytes),privateKey),stem=name.replace('.archive.encrypted.json','');
  for(const[recipient,key]of[['archive',archiveKey],['analysis',analysisKey]])writeFileSync(join(output,stem+'.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(value,key)),{mode:0o600});
  manifest.push({originalFile:name,originalEncryptedSha256:createHash('sha256').update(bytes).digest('hex'),semanticSha256:createHash('sha256').update(JSON.stringify(value)).digest('hex')});
 }
 const value={schemaVersion:1,kind:'offline_repack_manifest',sourceRun:43812850011,noSwcRequests:true,files:manifest};
 for(const[recipient,key]of[['archive',archiveKey],['analysis',analysisKey]])writeFileSync(join(output,'repack-manifest.'+recipient+'.encrypted.json'),JSON.stringify(sealJson(value,key)),{mode:0o600});
 console.log('Saved owner survey evidence repacked offline with authenticated encryption and compression. No SWC requests.');
}catch{console.error('Offline survey repack stopped; source evidence remains retained.');process.exitCode=1;}
