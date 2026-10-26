// Local/read-only runner for a captured workbook snapshot and four CSV exports.
// Example: node overview-cli.mjs --snapshot workbook.json --tff-stations ... --tjo-stations ...
//   --tff-materials ... --tjo-materials ... --out readiness.json
import fs from 'node:fs';
import {csv} from './production-sync.mjs';
import {calculateOverviewSnapshot} from './overview-snapshot.mjs';
function parseArgs(argv){
 const o={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('Expected --key value');o[argv[i].slice(2)]=argv[i+1];}
 for(const k of ['snapshot','tff-stations','tjo-stations','tff-materials','tjo-materials','out'])if(!o[k])throw Error('Missing --'+k);
 return o;
}
export function runSnapshotFiles(o){
 const snapshot=JSON.parse(fs.readFileSync(o.snapshot,'utf8'));
 const load=k=>csv(fs.readFileSync(o[k],'utf8'));
 const result=calculateOverviewSnapshot({
  ...snapshot,
  stations:[...load('tff-stations'),...load('tjo-stations')],
  materials:[...load('tff-materials'),...load('tjo-materials')]
 });
 // Persist only after all validations succeed.
 fs.writeFileSync(o.out,JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]?.endsWith('overview-cli.mjs'))try{
 const r=runSnapshotFiles(parseArgs(process.argv.slice(2)));
 console.log(JSON.stringify({mode:r.mode,statistics:r.statistics,systems:r.systems},null,2));
}catch(e){console.error('Readiness snapshot failed: '+e.message);process.exitCode=1;}
