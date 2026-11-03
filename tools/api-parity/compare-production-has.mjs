// Read-only API-to-production contract adapter. Unknown operations stay unknown.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {csv} from '../production-sync/production-sync.mjs';
import {buildLedger} from '../production-sync/audited-inventory.mjs';

const get=(o,...keys)=>keys.reduce((v,k)=>v?.[k],o);
const str=v=>v==null?'':String(v);
const mapLocation=(record)=>({
  sector:str(get(record,'location','sector','name')),
  system:str(get(record,'location','system','name')),
  sector_uid:str(get(record,'location','sector','uid')),
  system_uid:str(get(record,'location','system','uid')),
  sysX:str(get(record,'coordinates','system','x')),
  sysY:str(get(record,'coordinates','system','y')),
  container_uid:str(get(record,'location','container','uid')),
  container_type_name:({station:'Stations',facility:'Facilities',ship:'Ships',system:'Systems'})[get(record,'location','container','type')]||'',
});
export function normalizeMaterial(m) {
  const l=mapLocation(m);
  for(const key of ['system','sector','system_uid','container_uid','container_type_name'])
    if(!l[key])throw Error('Missing API material '+key+': '+m.uid);
  if(!Number.isSafeInteger(m.quantity)||m.quantity<0)throw Error('Invalid API material quantity: '+m.uid);
  return {...l,uid:m.uid,name:m.name,type_name:m.typeName,quantity:String(m.quantity),owner_uid:m.ownerUid};
}
export function normalizeStation(s) {
  const l=mapLocation(s);
  for(const key of ['system','sector','system_uid'])
    if(!l[key])throw Error('Missing API station '+key+': '+s.uid);
  const ops=s.operations||{};
  const actions=ops.productionActions;
  const running=Array.isArray(actions)?actions.filter(a=>a?.value?.status==='running'):[];
  if(running.length>1)throw Error('Multiple running actions: '+s.uid);
  const action=running[0]?.value;
  return {...l,uid:s.uid,name:s.name,type_name:s.typeName,owner_uid:s.ownerUid,
    'tooled-to':ops.tooledTo?.value??null,
    productionStatus:actions===null||actions===undefined?null:(action?'running':''),
    productionQuantity:actions===null||actions===undefined?null:(action?.quantity??'')};
}
function loadApi(dir,faction,kind) {
  const names=fs.readdirSync(dir).filter(n=>n.startsWith(faction+'__'+kind+'__system-kashyyyk__')&&n.endsWith('.json'));
  if(names.length!==1)throw Error('Expected one '+faction+' '+kind+' API snapshot; got '+names.length);
  const doc=JSON.parse(fs.readFileSync(path.join(dir,names[0]),'utf8'));
  if(doc.summary?.locationFilter?.uid!=='9:104')throw Error('Wrong API system for '+names[0]);
  if(!Array.isArray(doc[kind]))throw Error('Missing API '+kind);
  return doc[kind];
}
const key=r=>r.sheet+'|'+r.columnIndex+'|'+r.rowIndex+'|'+r.material;
const index=(arr)=>{const out=new Map();for(const x of arr){const k=key(x);if(out.has(k))throw Error('Duplicate HAS cell '+k);out.set(k,x.quantity)}return out};
export function compareLedgers(manifest,webStations,webMaterials,apiStations,apiMaterials) {
  const selected={...manifest,destinations:manifest.destinations.filter(d=>d.system==='Kashyyyk')};
  if(!selected.destinations.length)throw Error('No Kashyyyk destinations in manifest');
  const web=buildLedger(selected,webStations,webMaterials);
  const api=buildLedger(selected,apiStations,apiMaterials);
  const w=index(web.cells),a=index(api.cells),differences=[];
  for(const k of new Set([...w.keys(),...a.keys()]))if(w.get(k)!==a.get(k))
    differences.push({cell:k,web:w.get(k)??null,api:a.get(k)??null});
  return {schemaVersion:1,mode:'read_only',status:differences.length?'differences':'matched',
    statistics:{destinations:selected.destinations.length,webCells:w.size,apiCells:a.size,webPiles:web.statistics.uniquePiles,apiPiles:api.statistics.uniquePiles},
    differences};
}
function main(args) {
  const o={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected --key value');o[args[i].slice(2)]=args[i+1]}
  for(const k of ['api-dir','web-dir','manifest','out'])if(!o[k])throw Error('Missing --'+k);
  const load=(f,k)=>csv(fs.readFileSync(path.join(o['web-dir'],f+'-'+k+'.csv'),'utf8'));
  const webStations=['tff','tjo'].flatMap(f=>load(f,'stations'));
  const webMaterials=['tff','tjo'].flatMap(f=>load(f,'materials'));
  const apiStations=['tff','tjo'].flatMap(f=>loadApi(o['api-dir'],f,'stations').map(normalizeStation));
  const apiMaterials=['tff','tjo'].flatMap(f=>loadApi(o['api-dir'],f,'materials').map(normalizeMaterial));
  const manifest=JSON.parse(fs.readFileSync(o.manifest,'utf8'));
  const report=compareLedgers(manifest,webStations,webMaterials,apiStations,apiMaterials);
  fs.mkdirSync(path.dirname(o.out),{recursive:true});
  fs.writeFileSync(o.out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.statistics));
  if(report.differences.length)process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))
  try{main(process.argv.slice(2))}catch(e){console.error(e.stack);process.exitCode=1}
