import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.argv[2]||'/tmp/station-batches';
const expected=Number(process.env.EXPECTED_BATCHES||4);
const files=[];
function visit(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const path=join(dir,ent.name);if(ent.isDirectory())visit(path);else if(/^station-audit-\\d+\\.json$/.test(ent.name))files.push(path);}}
visit(root);
const reports=files.map(p=>JSON.parse(readFileSync(p,'utf8')));
const problems=[];
if(reports.length!==expected)problems.push(`Expected ${expected} batches, received ${reports.length}`);
const seen=new Set(), offsets=new Set(), rows=[];
for(const rep of reports){
 if(rep.system!=='Kashyyyk'||rep.faction!=='tjo')problems.push('Unexpected system/faction');
 if(offsets.has(rep.offset))problems.push(`Repeated offset ${rep.offset}`);offsets.add(rep.offset);
 if(rep.errors||rep.anomalies)problems.push(`Batch ${rep.offset}: errors=${rep.errors}, anomalies=${rep.anomalies}`);
 if(rep.processed!==rep.rows?.length)problems.push(`Batch ${rep.offset}: row count mismatch`);
 for(const row of rep.rows||[]){const key=`${row.faction}:${row.uid}`;if(seen.has(key))problems.push(`Duplicate station ${key}`);seen.add(key);rows.push(row);if(row.detailRead!=='ok')problems.push(`Failed station ${key}`);}
}
for(let i=0;i<expected;i++)if(!offsets.has(i*50))problems.push(`Missing offset ${i*50}`);
if(rows.length!==expected*50)problems.push(`Expected ${expected*50} station rows, received ${rows.length}`);
const result={system:'Kashyyyk',faction:'tjo',batchCount:reports.length,stationCount:rows.length,uniqueStations:seen.size,problems,rows:rows.sort((a,b)=>Number(a.uid)-Number(b.uid))};
mkdirSync('/tmp/station-merged',{recursive:true});
writeFileSync('/tmp/station-merged/merged.json',JSON.stringify(result,null,2));
console.log('MERGE_SUMMARY '+JSON.stringify({...result,rows:undefined}));
if(problems.length)process.exitCode=1;
