import{readFileSync,writeFileSync,mkdirSync,readdirSync}from'node:fs';import{join}from'node:path';import{createPublicKey}from'node:crypto';
import{encrypt,decrypt}from'../api-parity/private-audit-envelope.mjs';import{assembleSnapshot,snapshotReport}from'./planet-snapshot.mjs';
const open=path=>JSON.parse(decrypt(JSON.parse(readFileSync(path,'utf8')),process.env.SWC_API_SNAPSHOT_PRIVATE_KEY));
function files(root){return readdirSync(root,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(join(root,d.name)):[join(root,d.name)]);}
try{
 const [planDir,batchDir,output]=process.argv.slice(2);if(!output)throw Error('arguments');mkdirSync(output,{recursive:true,mode:0o700});
 const plan=open(join(planDir,'worker-plan.archive.encrypted.json')),inventory=open(join(planDir,'inventory.archive.encrypted.json'));
 const batches=files(batchDir).filter(p=>/batch-(cities|types)-\d{3}\.archive\.encrypted\.json$/.test(p)).map(open);
 const classifications=Object.fromEntries(inventory.factions.map(f=>[f.uid,{group:f.name==='The Faerytail Family'?'TFF':f.name==='The Faerytail Family: The Je`daii Order'?'TJO':'other_TFF_affiliate',evidence:'authenticated faction membership and exact API name'}]));
 const snapshot=assembleSnapshot(inventory,plan,batches,{ownerClassifications:classifications});
 const archiveKey=createPublicKey(process.env.SWC_API_SNAPSHOT_PRIVATE_KEY),report=snapshotReport(snapshot);
 const fullCatalog={schemaVersion:1,kind:'facility_type_catalog',runId:plan.runId,observedTo:snapshot.observationWindow.to,
  index:inventory.typeIndex,entries:batches.filter(b=>b.kind==='types').flatMap(b=>b.entries)};
 for(const [recipient,key]of[['archive',archiveKey],['analysis',plan.analysisPublicKey]]){
  for(const[name,bytes]of[['planet-snapshot',Buffer.from(JSON.stringify(snapshot))],['planet-report',Buffer.from(report)],
   ['facility-type-catalog',Buffer.from(JSON.stringify(fullCatalog))]])
   writeFileSync(join(output,name+'.'+recipient+'.encrypted.json'),JSON.stringify(encrypt(bytes,key)),{mode:0o600});
 }
 console.log('Versioned planetary snapshot assembled; reconciliation status and all data remain encrypted.');
}catch{console.error('Planetary snapshot assembly blocked; incomplete or conflicting evidence cannot certify a baseline.');process.exitCode=1;}
