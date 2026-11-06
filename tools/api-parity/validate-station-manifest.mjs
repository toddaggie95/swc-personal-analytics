import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
const [planPath,artifactRoot,outputPath='/tmp/station-merged/manifest-validation.json']=process.argv.slice(2);
if(!planPath||!artifactRoot)throw Error('Usage: node validate-station-manifest.mjs <plan.json> <artifact-directory> [output.json]');
const plan=JSON.parse(readFileSync(planPath,'utf8'));
if(plan.version!==1||!Array.isArray(plan.batches))throw Error('Invalid batch plan');
const files=[];
function visit(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const p=join(dir,ent.name);if(ent.isDirectory())visit(p);else if(/^station-audit-[a-z0-9-]+\.json$/.test(ent.name))files.push(p);}}
visit(artifactRoot);
const reports=files.map(p=>({path:p,report:JSON.parse(readFileSync(p,'utf8'))}));
const problems=[],expected=new Map(),actual=new Map();
for(const batch of plan.batches){
 if(!['tff','tjo'].includes(batch.faction)||!Array.isArray(batch.uids)||batch.expected!==batch.uids.length){problems.push('Invalid batch '+batch.id);continue;}
 for(const uid of batch.uids){const key=batch.faction+':'+String(uid);if(expected.has(key))problems.push('Duplicate planned station '+key);expected.set(key,batch.id);}
}
if(reports.length!==plan.batchCount)problems.push(`Expected ${plan.batchCount} batch reports, got ${reports.length}`);
for(const {path,report:rep} of reports){
 const filename=path.split('/').at(-1);
 const batchId=filename?.replace(/^station-audit-/,'').replace(/\.json$/,'');
 const planned=plan.batches.find(b=>b.id===batchId);
 if(planned){
  if(planned.faction!==rep.faction)problems.push('Wrong faction in batch '+batchId);
  if(rep.rows?.length!==planned.expected)problems.push('Wrong row count in batch '+batchId);
 }else if(/^((tff|tjo)-)/.test(batchId??''))problems.push('Unexpected batch artifact '+batchId);
 if(!['tff','tjo'].includes(rep.faction)||!Array.isArray(rep.rows)){problems.push('Invalid report');continue;}
 if(rep.errors)problems.push(`Report ${rep.faction}/${rep.offset} has ${rep.errors} errors`);
 for(const row of rep.rows){
  const key=rep.faction+':'+String(row.uid);
  if(!expected.has(key))problems.push('Unexpected station '+key);
  if(planned&&expected.get(key)!==batchId)problems.push('Station in wrong batch '+key);
  if(actual.has(key))problems.push('Duplicate collected station '+key);
  actual.set(key,row);
  if(row.detailRead!=='ok')problems.push('Failed station '+key);
 }
}
for(const key of expected.keys())if(!actual.has(key))problems.push('Missing station '+key);
const result={expectedStations:expected.size,collectedStations:actual.size,batchCount:reports.length,problems};
mkdirSync(dirname(outputPath),{recursive:true});
writeFileSync(outputPath,JSON.stringify(result,null,2));
console.log('MANIFEST_VALIDATION '+JSON.stringify({...result,problems:problems.slice(0,20),totalProblems:problems.length}));
if(problems.length)process.exitCode=1;
