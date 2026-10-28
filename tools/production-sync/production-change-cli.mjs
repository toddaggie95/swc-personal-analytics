// Offline report generator. No Google, GitHub, or email side effects.
import fs from 'node:fs';
import {snapshotFromOverview} from './production-change-snapshot.mjs';
import {compareProductionSnapshots} from './production-change-report.mjs';
function args(argv){const o={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('Expected --key value');o[argv[i].slice(2)]=argv[i+1];}for(const k of ['overview','snapshot-out','report-out'])if(!o[k])throw Error('Missing --'+k);return o;}
export function generate(o){
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const current=snapshotFromOverview(read(o.overview),{batchId:o['batch-id']??null,capturedAt:o['captured-at']??null});
 const previous=o.previous?read(o.previous):null;
 const report=previous?{status:'compared',...compareProductionSnapshots(previous,current)}:{status:'baseline_created',previousBatch:null,currentBatch:current.batchId,previousCount:null,currentCount:current.stations.length,changes:[],summary:{}};
 // Write only local output files; publishing the baseline is a separate, gated step.
 fs.writeFileSync(o['snapshot-out'],JSON.stringify(current,null,2)+'\n');
 fs.writeFileSync(o['report-out'],JSON.stringify(report,null,2)+'\n');
 return report;
}
if(process.argv[1]?.endsWith('production-change-cli.mjs'))try{const r=generate(args(process.argv.slice(2)));console.log(JSON.stringify({status:r.status,previousBatch:r.previousBatch,currentBatch:r.currentBatch,changes:r.changes.length,summary:r.summary}));}catch(e){console.error('Production change report failed: '+e.message);process.exitCode=1;}
