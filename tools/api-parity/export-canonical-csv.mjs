import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadApi,normalizeMaterial,normalizeStation} from './compare-production-has.mjs';
const ownerNames={tff:'The Faerytail Family',tjo:'The Faerytail Family: The Je`daii Order'};
const names=['tff-stations','tff-materials','tjo-stations','tjo-materials'];
const quote=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};
export function buildCanonical({apiDir,referenceDir,outDir,systems}){
 if(!Array.isArray(systems)||!systems.length||new Set(systems).size!==systems.length)throw Error('Invalid system registry');
 fs.mkdirSync(outDir,{recursive:true});const files=[];
 for(const name of names){
  const [owner,kind]=name.split('-');
  const columns=fs.readFileSync(path.join(referenceDir,name+'.csv'),'utf8').replace(/^\uFEFF/,'').split(/\r?\n/,1)[0].split(',');
  if(!columns.includes('uid')||!columns.includes('owner_name')||(kind==='stations'&&!columns.includes('tooled-to'))||(kind==='materials'&&!columns.includes('quantity')))throw Error('Invalid CSV template '+name);
  const records=loadApi(apiDir,owner,kind,'all',systems);
  if(!records.length)throw Error('Empty API dataset '+name);
  const rows=records.map(raw=>({...(kind==='stations'?normalizeStation(raw):normalizeMaterial(raw)),owner_name:ownerNames[owner]}));
  // A scoped inventory capture without operation details cannot safely drive Started flags.
  if(kind==='stations'&&rows.some(r=>r.productionStatus===null))
   throw Error('Incomplete API station operations in '+name);
  const known=new Set(rows.flatMap(r=>Object.keys(r)));
  const unknown=columns.filter(c=>!known.has(c));
  if(unknown.length)throw Error('Unmapped canonical columns in '+name+': '+unknown.join(','));
  if(rows.some(r=>!r.uid))throw Error('Missing UID '+name);
  const ids=new Set();
  for(const row of rows){if(ids.has(row.uid))throw Error('Duplicate UID '+name);ids.add(row.uid)}
  for(const row of rows){
   for(const field of columns){
    if(row[field]===undefined||row[field]===null)throw Error('Missing API field '+name+' '+field);
   }
  }
  const data=[columns.join(','),...rows.map(r=>columns.map(c=>quote(r[c])).join(','))].join('\n')+'\n';
  // Each output remains private to the runner until all four inputs validate.
  fs.writeFileSync(path.join(outDir,name+'.csv'),data,{mode:0o600});
  files.push({owner:owner.toUpperCase(),kind:kind==='stations'?'Stations':'Materials',id:'api:'+name,sha256:crypto.createHash('sha256').update(data).digest('hex'),rowCount:rows.length,canonicalName:name+'.csv'});
 }
 const snapshotId=crypto.createHash('sha256').update(files.map(f=>f.sha256).join(':')).digest('hex');
 const manifest={schemaVersion:1,source:'api',snapshotId,files};
 fs.writeFileSync(path.join(outDir,'export-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({source:'api',snapshotId,counts:files.map(f=>[f.canonicalName,f.rowCount])}));
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 try{
  if(process.argv.length!==6)throw Error('Usage: node export-canonical-csv.mjs API_DIR CSV_REFERENCE_DIR OUTPUT_DIR SYSTEMS_JSON');
  const registry=JSON.parse(fs.readFileSync(process.argv[5],'utf8'));
  buildCanonical({apiDir:process.argv[2],referenceDir:process.argv[3],outDir:process.argv[4],systems:registry.systems.map(s=>s.system)});
 }catch(e){console.error(e.stack);process.exitCode=1}
}
