import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {csv} from '../production-sync/production-sync.mjs';
import {buildLedger} from '../production-sync/audited-inventory.mjs';
import {systemInventory} from '../production-sync/system-has-audit.mjs';
import {calculateOverviewSnapshot} from '../production-sync/overview-snapshot.mjs';
import {compareReadiness} from './compare-readiness.mjs';

const str=v=>v==null?'':String(v);
export function adapt(row){
 const location=row.location??{},coordinates=row.coordinates??{};
 const result={uid:row.uid,name:row.name,type_uid:row.typeUid,type_name:row.typeName,owner_uid:row.ownerUid};
 for(const level of ['sector','system','planet','city']){
  result[level]=str(location[level]?.name);result[level+'_uid']=str(location[level]?.uid);
 }
 for(const [prefix,level] of [['gal','galaxy'],['sys','system'],['surf','surface'],['ground','ground']])
  for(const axis of ['x','y'])result[prefix+axis.toUpperCase()]=str(coordinates[level]?.[axis]);
 const container=location.container??{};
 result.container_uid=str(container.uid);
 result.container_type_name=({station:'Stations',facility:'Facilities',ship:'Ships',system:'Systems',planet:'Planets',city:'Cities'})[container.type]??str(container.type);
 if(row.entityType==='materials'){
  if(!Number.isSafeInteger(row.quantity)||row.quantity<0)throw Error('Invalid API quantity');
  result.quantity=String(row.quantity);
 }
 return result;
}
function index(rows,label){
 const result=new Map();
 for(const row of rows){if(!row.uid||result.has(row.uid))throw Error('Duplicate/missing '+label+' UID');result.set(row.uid,row);}
 return result;
}
export function compareLots(web,api){
 const w=index(web,'web'),a=index(api,'API'),issues=[];
 const fields=['type_uid','type_name','quantity','owner_uid','container_uid','container_type_name','system_uid','system','galX','galY','sysX','sysY','surfX','surfY','groundX','groundY'];
 for(const uid of new Set([...w.keys(),...a.keys()])){
  const left=w.get(uid),right=a.get(uid);
  if(!left||!right){issues.push({uid,field:'presence',web:!!left,api:!!right});continue;}
  for(const field of fields)if(str(left[field])!==str(right[field]))issues.push({uid,field,web:left[field],api:right[field]});
 }
 return {webLots:w.size,apiLots:a.size,matchedIds:[...w.keys()].filter(k=>a.has(k)).length,issues};
}
function compareTotals(web,api){
 const differences=[];
 for(const system of web.systems)for(const material of web.materials)
  if(web.systemTotals[system][material]!==api.systemTotals[system]?.[material])differences.push({system,material,web:web.systemTotals[system][material],api:api.systemTotals[system]?.[material]});
 return differences;
}
function main(){
 const [webDir,apiDir,snapshotFile,overviewFile,out]=process.argv.slice(2);
 if(!out)throw Error('Expected WEB API SNAPSHOT OVERVIEW OUTPUT');
 const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const snapshot=read(snapshotFile),webStations=[],webMaterials=[],apiStations=[],apiMaterials=[],sources=[];
 for(const faction of ['tff','tjo']){
  webStations.push(...csv(fs.readFileSync(path.join(webDir,faction+'-stations.csv'),'utf8')));
  webMaterials.push(...csv(fs.readFileSync(path.join(webDir,faction+'-materials.csv'),'utf8')));
 }
 for(const file of fs.readdirSync(apiDir)){
  if(!file.endsWith('.json'))continue;
  const doc=read(path.join(apiDir,file));
  if(!['stations','materials'].includes(doc.summary?.entityType)||doc.summary.locationFilter)throw Error('Expected complete unscoped inventory');
  const rows=doc[doc.summary.entityType];if(!Array.isArray(rows))throw Error('Missing API records');
  sources.push({file,entityType:doc.summary.entityType,ownerUid:doc.summary.ownerUid,completedAt:doc.summary.completedAt,count:rows.length});
  (doc.summary.entityType==='stations'?apiStations:apiMaterials).push(...rows.map(adapt));
 }
 if(sources.length!==4||new Set(sources.map(s=>s.entityType+':'+s.ownerUid)).size!==4)throw Error('Incomplete or duplicate API capture set');
 index(apiStations,'API station');index(webStations,'web station');
 const inventory=compareLots(webMaterials,apiMaterials);
 const webLedger=buildLedger(snapshot.manifest,webStations,webMaterials),apiLedger=buildLedger(snapshot.manifest,apiStations,apiMaterials);
 const hubDifferences=[];
 const cells=new Map(webLedger.cells.map(c=>[c.sheet+':'+c.columnIndex+':'+c.rowIndex,c]));
 for(const cell of apiLedger.cells){const web=cells.get(cell.sheet+':'+cell.columnIndex+':'+cell.rowIndex);if(!web||web.quantity!==cell.quantity)hubDifferences.push({cell,web:web?.quantity});}
 const sheetHasDifferences=[];
 for(const cell of apiLedger.cells){
  const raw=snapshot.rowsBySystem[cell.sheet]?.[cell.rowIndex+1]?.[cell.columnIndex]??'';
  const actual=raw===''?0:Number(str(raw).replaceAll(',',''));
  if(!Number.isFinite(actual))throw Error('Nonnumeric captured HAS cell');
  if(actual!==cell.quantity)sheetHasDifferences.push({...cell,sheetValue:actual});
 }
 const webSystem=systemInventory(webStations,webMaterials,snapshot.manifest),apiSystem=systemInventory(apiStations,apiMaterials,snapshot.manifest);
 const systemDifferences=compareTotals(webSystem,apiSystem);
 const webById=index(webMaterials,'web material'),apiById=index(apiMaterials,'API material');
 const contribution=new Map(systemDifferences.map(d=>[d.system+'|'+d.material,[]]));
 for(const uid of new Set(inventory.issues.map(x=>x.uid))){
  const before=webById.get(uid),after=apiById.get(uid);
  const w=systemInventory(webStations,before?[before]:[],snapshot.manifest);
  const a=systemInventory(apiStations,after?[after]:[],snapshot.manifest);
  for(const difference of systemDifferences){
   const delta=a.systemTotals[difference.system][difference.material]-w.systemTotals[difference.system][difference.material];
   if(delta)contribution.get(difference.system+'|'+difference.material).push({uid,delta,webQuantity:before?.quantity??null,apiQuantity:after?.quantity??null,webContainer:before?.container_type_name??null,apiContainer:after?.container_type_name??null});
  }
 }
 const attribution=systemDifferences.map(d=>{const lots=contribution.get(d.system+'|'+d.material);const explained=lots.reduce((n,x)=>n+x.delta,0);return {...d,delta:d.api-d.web,explained,residual:d.api-d.web-explained,lots};});
 const totals=rows=>{const values=new Map();for(const row of rows){const key=row.owner_uid+'|'+str(row.type_name).toLowerCase();values.set(key,(values.get(key)??0)+Number(row.quantity));}return values;};
 const wt=totals(webMaterials),at=totals(apiMaterials),aggregateDifferences=[];
 for(const key of new Set([...wt.keys(),...at.keys()]))if(wt.get(key)!==at.get(key))aggregateDifferences.push({key,web:wt.get(key)??0,api:at.get(key)??0});
 const systemSheetDifferences=[];
 for(const system of apiSystem.systems){
  const rows=snapshot.rowsBySystem[system],heads=[];
  for(const [i,row] of rows.entries())for(const [j,value] of row.entries())if(str(value).trim().toLowerCase()==='system has')heads.push([i,j]);
  if(heads.length!==1)throw Error('Ambiguous System HAS heading');
  const [i,j]=heads[0];
  for(const [offset,material] of apiSystem.materials.entries()){
   const value=Number(str(rows[i+1+offset]?.[j]).replaceAll(',',''));
   if(!Number.isFinite(value))throw Error('Nonnumeric System HAS cell');
   if(value!==apiSystem.systemTotals[system][material])systemSheetDifferences.push({system,material,sheet:value,api:apiSystem.systemTotals[system][material]});
  }
 }
 const webReadiness=calculateOverviewSnapshot({...snapshot,stations:webStations,materials:webMaterials});
 const apiReadiness=calculateOverviewSnapshot({...snapshot,stations:apiStations,materials:apiMaterials});
 const readiness=compareReadiness(webReadiness,apiReadiness);
 const counts=Object.values(apiReadiness.systems).reduce((totals,row)=>{for(const [key,value] of Object.entries(row))totals[key]=(totals[key]??0)+value;return totals;},{});
 const overview=read(overviewFile).values,sheetReadinessDifferences=[];
 for(const [system,status] of Object.entries(apiReadiness.systems)){
  const row=overview.find(r=>r[0]===system);
  if(!row)throw Error('System absent from captured overview');
  for(const [i,key] of ['building','ready_now','transfer','blocked','unassigned'].entries())if(Number(str(row[2+2*i]).replaceAll(',',''))!==status[key])sheetReadinessDifferences.push({system,status:key,sheet:row[2+2*i],api:status[key]});
 }
 const report={mode:'read_only',writeAuthorized:false,sources,inventory,
  hubHas:{cells:apiLedger.cells.length,differences:hubDifferences,sheetDifferences:sheetHasDifferences},
  aggregateMaterialTotals:{ownerMaterialPairs:wt.size,differences:aggregateDifferences},
  systemHas:{cells:apiSystem.statistics.systemHasCells,differences:systemDifferences,attribution,sheetDifferences:systemSheetDifferences,webExcluded:webSystem.excluded,apiExcluded:apiSystem.excluded,webErrors:webSystem.errors,apiErrors:apiSystem.errors},
  readiness:{status:readiness.status,orders:apiReadiness.orders.length,counts,differences:readiness.differences,sheetDifferences:sheetReadinessDifferences},
  limitations:['Readiness uses the same captured sheet assignments, quantities, Started flags and bills for both sources.','Inventory snapshots are not simultaneous.','Raw lot/coordinate differences and eligibility-adjusted HAS differences are distinct checks.']};
 fs.mkdirSync(out,{recursive:true});
 for(const [name,value] of Object.entries({report,webLedger,apiLedger,webSystem,apiSystem,webReadiness,apiReadiness}))fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2)+'\n');
 console.log(JSON.stringify({webLots:inventory.webLots,apiLots:inventory.apiLots,matchedIds:inventory.matchedIds,lotFieldDifferences:inventory.issues.length,hubCells:report.hubHas.cells,hubDifferences:hubDifferences.length,sheetHasDifferences:sheetHasDifferences.length,systemCells:report.systemHas.cells,systemDifferences:report.systemHas.differences.length,readinessOrders:report.readiness.orders,readinessDifferences:readiness.differences.length,sheetReadinessDifferences:sheetReadinessDifferences.length,counts}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
