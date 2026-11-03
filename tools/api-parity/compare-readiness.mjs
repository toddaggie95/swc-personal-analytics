// Read-only parity gate for already-generated production readiness outputs.
// Both outputs must be produced from the same assignments, bills and priority.
import fs from 'node:fs';
import {snapshotFromOverview} from '../production-sync/production-change-snapshot.mjs';
import {compareProductionSnapshots} from '../production-sync/production-change-report.mjs';

const stable=v=>JSON.stringify(v,Object.keys(v??{}).sort());
function keyed(rows,label){
  const m=new Map();
  for(const r of rows){
    const id=String(r.id??'');
    if(!id||m.has(id))throw Error(label+': duplicate/missing order ID '+id);
    m.set(id,r);
  }
  return m;
}
export function compareReadiness(web,api,previous=null){
  if(web?.mode!=='read_only'||api?.mode!=='read_only')throw Error('Read-only readiness outputs required');
  if(!Array.isArray(web.orders)||!Array.isArray(api.orders))throw Error('Missing orders');
  const w=keyed(web.orders,'web'),a=keyed(api.orders,'api'),differences=[];
  const fields=['system','destinationId','ship','quantity','started','status','bill','shortfall'];
  for(const id of [...new Set([...w.keys(),...a.keys()])].sort()){
    const before=w.get(id),after=a.get(id);
    if(!before||!after){differences.push({id,field:'presence',web:!!before,api:!!after});continue;}
    for(const field of fields){
      const left=before[field]??null,right=after[field]??null;
      if(stable(left)!==stable(right))differences.push({id,field,web:left,api:right});
    }
  }
  let changes=null;
  if(previous){
    const webSnapshot=snapshotFromOverview(web);
    const apiSnapshot=snapshotFromOverview(api);
    const wChanges=compareProductionSnapshots(previous,webSnapshot);
    const aChanges=compareProductionSnapshots(previous,apiSnapshot);
    const normalize=report=>report.changes.map(x=>({uid:x.uid,type:x.type,field:x.field??null,before:x.before??null,after:x.after??null})).sort((x,y)=>stable(x).localeCompare(stable(y)));
    const left=normalize(wChanges),right=normalize(aChanges);
    changes={webCount:left.length,apiCount:right.length,matched:stable(left)===stable(right)};
    if(!changes.matched)differences.push({field:'production_changes',web:left,api:right});
  }
  return {schemaVersion:1,mode:'read_only',status:differences.length?'differences':'matched',webOrders:w.size,apiOrders:a.size,changes,differences};
}
if(process.argv[1]&&process.argv[1].endsWith('compare-readiness.mjs')){
  try{
    const args=Object.fromEntries(process.argv.slice(2).reduce((out,x,i,arr)=>{if(i%2===0)out.push([x.replace(/^--/,''),arr[i+1]]);return out},[]));
    for(const k of ['web','api','out'])if(!args[k])throw Error('Missing --'+k);
    const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
    const result=compareReadiness(read(args.web),read(args.api),args.previous?read(args.previous):null);
    fs.writeFileSync(args.out,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({status:result.status,webOrders:result.webOrders,apiOrders:result.apiOrders,changes:result.changes}));
    if(result.differences.length)process.exitCode=2;
  }catch(e){console.error(e.stack);process.exitCode=1;}
}
