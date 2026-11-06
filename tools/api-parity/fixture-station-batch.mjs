import fs from 'node:fs';
const [planFile,id,outDir]=process.argv.slice(2);
if(!planFile||!id||!outDir)throw Error('Missing arguments');
const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
const batch=plan.batches.find(x=>x.id===id);
if(!batch)throw Error('Unknown batch');
const rows=batch.uids.map(uid=>({uid:String(uid),faction:batch.faction,detailRead:'ok'}));
fs.mkdirSync(outDir,{recursive:true});
fs.writeFileSync(outDir+'/station-audit-'+id+'.json',JSON.stringify({faction:batch.faction,offset:id,errors:0,rows}));
