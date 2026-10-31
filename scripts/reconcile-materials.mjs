import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [tffCsv,tjoCsv,tffJson,tjoJson,reportPath] = process.argv.slice(2);
if (![tffCsv,tjoCsv,tffJson,tjoJson].every(Boolean)) throw Error('Usage: node scripts/reconcile-materials.mjs <TFF-Materials.csv> <TJO-Materials.csv> <TFF-probe.json> <TJO-probe.json> [report.json]');
function csvParse(s) {
  const table=[];let row=[],cell='',quote=false;
  for(let i=0;i<s.length;i++){const c=s[i];if(quote){if(c==='"'&&s[i+1]==='"'){cell+='"';i++;}else if(c==='"')quote=false;else cell+=c;}else if(c==='"')quote=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x!==''))table.push(row);row=[];}else cell+=c;}
  if(quote)throw Error('Unclosed CSV quote');if(cell||row.length){row.push(cell);table.push(row);}
  const [headers,...records]=table;if(!headers)throw Error('Empty CSV');
  return {headers:headers.map(h=>h.replace(/^\uFEFF/,'').trim()),records:records.map(r=>Object.fromEntries(headers.map((h,i)=>[h.replace(/^\uFEFF/,'').trim(),r[i]??''])))};
}
const key=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const value=x=>x==null?'':String(x).trim();
function field(headers,names){return headers.find(h=>names.some(n=>key(h)===key(n)))??null;}
const definitions={
 uid:['uid','pile uid','material uid','entity uid','id'],
 type:['type_name','type name','material type','material','type'],
 quantity:['quantity','amount','qty','units'],
 containerUid:['container uid','container_uid','location container uid','location_container_uid'],
 containerType:['container type','container_type','location container type','location_container_type'],
 system:['system','system name','system_name'],
 owner:['owner uid','owner_uid','owner'],
 x:['system x','system_x','system coord x','system coordinate x'],
 y:['system y','system_y','system coord y','system coordinate y']
};
function normalizedContainerType(v){const k=key(v);return ({'2':'ship','4':'facility','5':'station',ship:'ship',facility:'facility',station:'station'})[k]??k;}\nfunction classify(lot){const c=lot.location?.container??{};const type=key(c.type);const uid=value(c.uid);if(type==='ship'||uid.startsWith('2:'))return 'ship-excluded';if(type==='station'||uid.startsWith('5:'))return 'station-candidate';if(type==='facility'||uid.startsWith('4:'))return 'facility-requires-validation';return 'unknown-excluded-pending-review';}
function compare(csv,snapshot,faction){
 if(snapshot.summary?.faction!==faction||snapshot.summary?.location?.kind!=='system'||snapshot.summary?.location?.uid!=='9:104'||snapshot.summary?.complete!==true)throw Error(faction+': expected complete Kashyyyk system probe');
 if(!Array.isArray(snapshot.lots))throw Error(faction+': missing lots');
 const columns=Object.fromEntries(Object.entries(definitions).map(([name,aliases])=>[name,field(csv.headers,aliases)]));
 if(!columns.uid)throw Error(faction+': no recognized UID header; found '+JSON.stringify(csv.headers));
 const csvRows=csv.records.filter(r=>value(r[columns.uid]));
 const csvByUid=new Map();for(const r of csvRows){const uid=value(r[columns.uid]);if(csvByUid.has(uid))throw Error(faction+': duplicate CSV UID '+uid);csvByUid.set(uid,r);}
 const apiByUid=new Map();for(const lot of snapshot.lots){if(apiByUid.has(lot.uid))throw Error(faction+': duplicate API UID '+lot.uid);apiByUid.set(lot.uid,lot);}
 const comparable=Object.fromEntries(['type','quantity','containerUid','containerType','system','owner','x','y'].map(f=>[f,Boolean(columns[f])]));
 const mismatches=[],matched=[],missingFromCsv=[],missingFromApi=[],outsideKashyyykCsv=[];
 for(const lot of snapshot.lots){const r=csvByUid.get(lot.uid);if(!r){missingFromCsv.push({uid:lot.uid,classification:classify(lot)});continue;}
 const expected={type:lot.typeName,quantity:lot.quantity,containerUid:lot.location?.container?.uid,containerType:lot.location?.container?.type,system:lot.location?.system?.name,owner:lot.ownerUid,x:lot.coordinates?.system?.x,y:lot.coordinates?.system?.y};
 const differences=[];for(const f of Object.keys(comparable)){if(!comparable[f])continue;const actual=value(r[columns[f]]);const api=value(expected[f]);const same=f==='quantity'||f==='x'||f==='y'?actual!==''&&api!==''&&Number(actual)===Number(api):f==='containerType'?normalizedContainerType(actual)===normalizedContainerType(api):key(actual)===key(api);if(!same)differences.push({field:f,csv:actual,api});}
 if(differences.length)mismatches.push({uid:lot.uid,differences});else matched.push(lot.uid);
 }
 // CSV can include other systems. Only consider API-missing rows if system can be proven Kashyyyk.
 if(columns.system){for(const [uid,r] of csvByUid){if(apiByUid.has(uid))continue;if(key(r[columns.system])==='kashyyyk')missingFromApi.push({uid});else outsideKashyyykCsv.push(uid);}}
 const fieldMismatchCounts={};for(const item of mismatches)for(const d of item.differences)fieldMismatchCounts[d.field]=(fieldMismatchCounts[d.field]??0)+1;\n const classification={};for(const lot of snapshot.lots){const c=classify(lot);classification[c]=(classification[c]??0)+1;}
 return {faction,csvHeaders:csv.headers,columnMapping:columns,comparable,apiLots:snapshot.lots.length,csvRows:csvRows.length,matched:matched.length,mismatches,fieldMismatchCounts,apiOnly:missingFromCsv,csvOnlyInKashyyyk:missingFromApi,csvUnscopedOrOtherSystem:outsideKashyyykCsv.length,classification,apiObservedAtRange:[...snapshot.lots.map(l=>l.observedAt)].sort().filter((_,i,a)=>i===0||i===a.length-1),caveats:['CSV/API timestamps may differ.','Absent CSV fields are not compared.','Station and facility eligibility are candidates only; validate containers against owned inventories.','If CSV has no system column, CSV-only Kashyyyk completeness cannot be assessed.']};
}
const files=await Promise.all([tffCsv,tjoCsv,tffJson,tjoJson].map(p=>readFile(resolve(p),'utf8')));
const reports=[compare(csvParse(files[0]),JSON.parse(files[2]),'tff'),compare(csvParse(files[1]),JSON.parse(files[3]),'tjo')];
const report={summary:{apiLots:reports.reduce((n,r)=>n+r.apiLots,0),matched:reports.reduce((n,r)=>n+r.matched,0),mismatched:reports.reduce((n,r)=>n+r.mismatches.length,0),apiOnly:reports.reduce((n,r)=>n+r.apiOnly.length,0),csvOnlyInKashyyyk:reports.reduce((n,r)=>n+r.csvOnlyInKashyyyk.length,0),warning:'Read-only, timestamp-unsynchronized comparison. Missing CSV columns are explicitly skipped; no HAS writes.'},factions:reports};
if(reportPath)await writeFile(resolve(reportPath),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({summary:report.summary,factions:reports.map(({faction,columnMapping,comparable,apiLots,csvRows,matched,mismatches,apiOnly,csvOnlyInKashyyyk,classification})=>({faction,columnMapping,comparable,apiLots,csvRows,matched,mismatches:mismatches.length,fieldMismatchCounts:reports.find(r=>r.faction===faction).fieldMismatchCounts,apiOnly:apiOnly.length,csvOnlyInKashyyyk:csvOnlyInKashyyyk.length,classification}))},null,2));
