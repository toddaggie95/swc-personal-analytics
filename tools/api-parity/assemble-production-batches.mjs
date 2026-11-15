import fs from 'node:fs';
import path from 'node:path';
import {createPublicKey} from 'node:crypto';
import {encrypt,decrypt} from './private-audit-envelope.mjs';
import {mergeResults} from './production-batches.mjs';
import {buildCanonical} from './export-canonical-csv.mjs';
import {sealSnapshot} from './api-snapshot.mjs';
const [planFile,batchDir,out]=process.argv.slice(2);
try{
 if(!out||!process.env.SWC_API_SNAPSHOT_PRIVATE_KEY)throw Error('Missing assembly arguments/key');
 const key=process.env.SWC_API_SNAPSHOT_PRIVATE_KEY,publicKey=createPublicKey(key);
 const open=file=>JSON.parse(decrypt(JSON.parse(fs.readFileSync(file,'utf8')),key));
 const plan=open(planFile),results=[];
 function visit(dir){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())visit(file);else if(/^batch-[a-z0-9-]+\.encrypted\.json$/.test(entry.name))results.push(open(file));}}
 visit(batchDir);
 const merged=mergeResults(plan,results,fs.readFileSync(new URL('./production-contract.mjs',import.meta.url)));
 fs.mkdirSync(out,{recursive:true});
 // Always retain compatible successes before refusing incomplete coverage.
 fs.writeFileSync(path.join(out,'production-progress.encrypted.json'),JSON.stringify(encrypt(Buffer.from(JSON.stringify(merged.progress)),publicKey)),{mode:0o600});
 console.log('PRODUCTION_API_ASSEMBLY '+JSON.stringify({completed:merged.progress.entries.length,missing:merged.missing.length,batches:results.length,expectedBatches:plan.batches.length}));
 if(!merged.complete)throw Error('Incomplete batch coverage');
 const normalized=path.join(out,'normalized');fs.mkdirSync(normalized,{recursive:true});
 for(const {name,doc} of merged.documents){if(!/^[A-Za-z0-9_.-]+\.json$/.test(name)||path.basename(name)!==name)throw Error('Unsafe normalized filename');fs.writeFileSync(path.join(normalized,name),JSON.stringify(doc),{mode:0o600});}
 const canonical=path.join(out,'canonical');
 buildCanonical({apiDir:normalized,referenceDir:null,outDir:canonical,systems:plan.systems});
 fs.writeFileSync(path.join(out,'api-inputs.encrypted.json'),JSON.stringify(sealSnapshot(canonical,publicKey)),{mode:0o600});
 const files=merged.documents.map(({name,doc})=>({path:'collector-progress/'+name,data:Buffer.from(JSON.stringify(doc)).toString('base64')}));
 files.push({path:'production-progress.json',data:Buffer.from(JSON.stringify(merged.progress)).toString('base64')});
 fs.writeFileSync(path.join(out,'api-input-evidence.encrypted.json'),JSON.stringify(encrypt(Buffer.from(JSON.stringify({version:1,files})),fs.readFileSync(new URL('./production-audit-public-key.pem',import.meta.url)))),{mode:0o600});
}catch{console.error('Production batch assembly failed; private details suppressed. No production writes authorized.');process.exitCode=1;}
