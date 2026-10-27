// Independent read-only shadow comparison of live HAS cells and overview inventory.
import fs from 'node:fs';
import {csv,MATERIALS} from './production-sync.mjs';
import {buildLedger} from './audited-inventory.mjs';
import {liveProductionOrders} from './live-orders.mjs';
import {shipBillsFromRows} from './ship-bills.mjs';
import {mapProductionOrders} from './readiness-orders.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,v)=>{if(i%2===0)a.push([x.replace(/^--/,''),v[i+1]]);return a},[]));
for(const key of ['snapshot','overview','tff-stations','tjo-stations','tff-materials','tjo-materials','out'])if(!args[key])throw Error('Missing '+key);
const snapshot=read(args.snapshot),overview=read(args.overview);
const load=k=>csv(fs.readFileSync(args[k],'utf8'));
const stations=[...load('tff-stations'),...load('tjo-stations')];
const materials=[...load('tff-materials'),...load('tjo-materials')];
const ledger=buildLedger(snapshot.manifest,stations,materials);
const differences=[],errors=[];
const number=v=>{if(typeof v==='number')return Number.isSafeInteger(v)?v:null;const s=String(v??'').trim().replaceAll(',','');return /^\d+$/.test(s)?Number(s):null};
let hasCompared=0;
for(const cell of ledger.cells){
 const row=snapshot.rowsBySystem[cell.sheet]?.[cell.rowIndex+1];
 const raw=row?.[cell.columnIndex];
 const actual=number(raw);
 if(actual===null){errors.push({kind:'invalid_live_has',sheet:cell.sheet,row:cell.rowIndex+1,column:cell.columnIndex+1,material:cell.material,value:raw??null});continue;}
 hasCompared++;
 if(actual!==cell.quantity)differences.push({kind:'has_mismatch',destination:cell.destination,sheet:cell.sheet,row:cell.rowIndex+1,column:cell.columnIndex+1,material:cell.material,actual,expected:cell.quantity});
}
const live=liveProductionOrders({manifest:snapshot.manifest,stations,rowsBySystem:snapshot.rowsBySystem});
const mapped=mapProductionOrders({auditedOrders:live,manifest:snapshot.manifest,stations,rowsBySystem:snapshot.rowsBySystem,shipBills:shipBillsFromRows(snapshot.shipRows),liveOrders:true});
const expected=new Map(mapped.map(x=>[x.id,x]));
const actual=new Map(overview.orders.map(x=>[x.id,x]));
if(actual.size!==overview.orders.length)errors.push({kind:'duplicate_overview_orders'});
for(const [id,e] of expected){
 const a=actual.get(id);
 if(!a){differences.push({kind:'missing_overview_order',id});continue;}
 for(const key of ['system','destinationId','ship','quantity','started']){
  if(a[key]!==e[key])differences.push({kind:'order_drift',id,field:key,expected:e[key],actual:a[key]});
 }
 if(JSON.stringify(a.bill)!==JSON.stringify(e.bill))differences.push({kind:'bill_drift',id,expected:e.bill,actual:a.bill});
}
for(const id of actual.keys())if(!expected.has(id))differences.push({kind:'unexpected_overview_order',id});
const report={schemaVersion:1,mode:'read_only',status:errors.length?'validation_errors':differences.length?'differences_found':'matched',statistics:{hasCellsExpected:ledger.cells.length,hasCellsCompared:hasCompared,liveOrders:expected.size,overviewOrders:actual.size,differences:differences.length,validationErrors:errors.length},errors,differences};
fs.writeFileSync(args.out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,statistics:report.statistics}));
if(errors.length)process.exitCode=1;
