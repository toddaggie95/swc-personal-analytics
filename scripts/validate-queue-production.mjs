import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [csvArg, snapshotArg, reportArg] = process.argv.slice(2);
if (!csvArg || !snapshotArg) throw new Error('Usage: node scripts/validate-queue-production.mjs <stations.csv> <snapshot.json> [report.json]');
function parseCsv(input) {
  const rows=[]; let row=[],cell='',quoted=false;
  for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(Boolean))rows.push(row);row=[];}else cell+=c;}
  if(quoted)throw Error('Unterminated CSV quote');if(cell||row.length){row.push(cell);rows.push(row);}
  const [headers,...records]=rows;if(!headers)throw Error('Empty CSV');
  return records.map(values=>Object.fromEntries(headers.map((h,i)=>[h.replace(/^\uFEFF/,''),values[i]??''])));
}
const [csv,snapshot]=await Promise.all([readFile(resolve(csvArg),'utf8').then(parseCsv),readFile(resolve(snapshotArg),'utf8').then(JSON.parse)]);
if(!Array.isArray(snapshot.stations))throw Error('Invalid snapshot');
const byUid=new Map(snapshot.stations.map(s=>[String(s.uid),s]));
const counts={total:csv.length,notChecked:0,queueMissing:0,queueEmpty:0,queuePopulated:0,queueProducing:0,queueQueuedOnly:0,unknownQueueStatus:0,agreements:0,disagreements:0,actionQueueConflicts:0};
const disagreements=[],unknownStatus=[],actionQueueConflicts=[];
for(const row of csv){
 const s=byUid.get(String(row.uid).trim());if(!s)throw Error('Missing station UID '+row.uid);
 const o=s.operations;if(!o||o.status==='not-checked'){counts.notChecked++;continue;}
 const queue=o.queueItems;
 if(!Array.isArray(queue)){counts.queueMissing++;continue;}
 if(!queue.length){counts.queueEmpty++;continue;}
 counts.queuePopulated++;
 const statuses=queue.map(q=>String(q?.status??'').toLowerCase());
 if(statuses.some(x=>x!=='queued'&&x!=='producing')){counts.unknownQueueStatus++;unknownStatus.push({uid:s.uid,statuses});continue;}
 const running=statuses.includes('producing');if(running)counts.queueProducing++;else counts.queueQueuedOnly++;
 const csvRunning=String(row.productionStatus??'').trim().toLowerCase()==='running';
 if(running===csvRunning)counts.agreements++;else{counts.disagreements++;disagreements.push({uid:s.uid,csvStatus:row.productionStatus,queueStatuses:[...new Set(statuses)],observedAt:o.observedAt??null});}
 if(Array.isArray(o.productionActions)){const actionRunning=o.productionActions.length>0;if(actionRunning!==running){counts.actionQueueConflicts++;actionQueueConflicts.push({uid:s.uid,queueRunning:running,actionRunning,observedAt:o.observedAt??null});}}
}
const report={summary:{...counts,agreementRate:counts.agreements+counts.disagreements?counts.agreements/(counts.agreements+counts.disagreements):null,caveat:'Populated queue comparison only. Missing/empty queues do not prove idle. CSV timestamp not established.'},disagreements,unknownStatus,actionQueueConflicts};
if(reportArg)await writeFile(resolve(reportArg),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify(report.summary,null,2));
