import {readFileSync,writeFileSync} from 'node:fs';
const [planFile,outputFile]=process.argv.slice(2);
if(!planFile||!outputFile)throw Error('Usage: build-matrix-from-plan.mjs plan.json github-output');
const plan=JSON.parse(readFileSync(planFile,'utf8'));
if(plan.version!==1||!Array.isArray(plan.batches)||!plan.batches.length)throw Error('Invalid plan');
if(plan.batches.length>256)throw Error('GitHub Actions matrix exceeds 256 jobs');
const include=plan.batches.map(b=>{
 if(!/^(tff|tjo)-\d{3,}$/.test(b.id)||!['tff','tjo'].includes(b.faction)||!Array.isArray(b.uids)||b.expected!==b.uids.length)throw Error('Invalid batch '+b.id);
 return {id:b.id,faction:b.faction,expected:b.expected};
});
writeFileSync(outputFile,`matrix=${JSON.stringify({include})}\n`,{flag:'a'});
console.log('MATRIX_SUMMARY '+JSON.stringify({jobs:include.length,stations:include.reduce((n,b)=>n+b.expected,0)}));
