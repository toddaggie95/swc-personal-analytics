import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {csv} from '../production-sync/production-sync.mjs';
import {calculateOverviewSnapshot} from '../production-sync/overview-snapshot.mjs';
export function projectWorkbook(snapshot,ledger,started){
 const projected=structuredClone(snapshot);
for(const change of started.changes){
 const row=projected.rowsBySystem[change.system]?.[change.row];
 if(!row||String(row[change.column]??'').trim()!==change.previous)throw Error('Started preview precondition changed');
 while(row.length<=change.column)row.push('');row[change.column]=change.proposed;
}
for(const cell of ledger.cells){
 const rows=projected.rowsBySystem[cell.sheet],index=cell.rowIndex+1;
 if(!rows?.[index])throw Error('HAS preview target missing');
 while(rows[index].length<=cell.columnIndex)rows[index].push('');
 rows[index][cell.columnIndex]=String(cell.quantity);
}
 return projected;
}
function main(){
const [snapshotFile,ledgerFile,startedFile,exportDir,outDir]=process.argv.slice(2);
if(!outDir)throw Error('Expected SNAPSHOT LEDGER STARTED EXPORT_DIR OUTPUT_DIR');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const snapshot=read(snapshotFile),ledger=read(ledgerFile),started=read(startedFile);
const projected=projectWorkbook(snapshot,ledger,started);
const rows=kind=>['tff','tjo'].flatMap(f=>csv(fs.readFileSync(path.join(exportDir,f+'-'+kind+'.csv'),'utf8')));
const overview=calculateOverviewSnapshot({...projected,stations:rows('stations'),materials:rows('materials')});
fs.mkdirSync(outDir,{recursive:true});
for(const [name,data] of Object.entries({'projected-workbook':projected,'overview-readiness':overview}))
 fs.writeFileSync(path.join(outDir,name+'.json'),JSON.stringify(data,null,2)+'\n',{mode:0o600});
const counts=Object.values(overview.systems).reduce((totals,s)=>{for(const [k,v]of Object.entries(s))totals[k]=(totals[k]??0)+v;return totals;},{});
const summary={mode:'dry_run',writeAuthorized:false,source:read(path.join(exportDir,'export-manifest.json')).source??'csv',stations:rows('stations').length,materialLots:rows('materials').length,hasCells:ledger.cells.length,startedChanges:started.changes.length,orders:overview.orders.length,counts};
fs.writeFileSync(path.join(outDir,'preview-summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log('PRODUCTION_PREVIEW '+JSON.stringify(summary));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
