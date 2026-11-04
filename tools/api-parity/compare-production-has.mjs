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
function loadApi(dir,faction,kind,system='Kashyyyk',expectedSystems=[system]) {
  const files=fs.readdirSync(dir).filter(n=>n.startsWith(faction+'__'+kind+'__system-')&&n.endsWith('.json'));
  const matched=[];
  for(const name of files){
    const doc=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
    const scope=doc.summary?.locationFilter;
    if(system!=='all'&&scope?.name!==system)continue;
    if(!scope?.uid||!scope?.name||!Array.isArray(doc[kind]))throw Error('Invalid scoped API capture '+name);
    matched.push({name,scope,rows:doc[kind]});
  }
  if(!matched.length)throw Error('No '+faction+' '+kind+' API captures for '+system);
  const seenScopes=new Set(),seenUids=new Set(),out=[];
  for(const capture of matched){
    if(seenScopes.has(capture.scope.uid))throw Error('Duplicate API capture scope '+capture.scope.uid);
    seenScopes.add(capture.scope.uid);
    for(const row of capture.rows){
      if(!row.uid||seenUids.has(row.uid))throw Error('Duplicate or missing API UID in '+capture.name);
      seenUids.add(row.uid);
      if(row.location?.system?.uid!==capture.scope.uid)throw Error('API entity outside capture scope '+row.uid);
      out.push(row);
    }
  }
  const found=new Set(matched.map(c=>c.scope.name));
  for(const expected of expectedSystems)if(!found.has(expected))throw Error('Missing '+faction+' '+kind+' scoped API capture for '+expected);
  return out;
}
const key=r=>r.sheet+'|'+r.columnIndex+'|'+r.rowIndex+'|'+r.material;
const index=(arr)=>{const out=new Map();for(const x of arr){const k=key(x);if(out.has(k))throw Error('Duplicate HAS cell '+k);out.set(k,x.quantity)}return out};
export function compareLedgers(manifest,webStations,webMaterials,apiStations,apiMaterials,system='Kashyyyk') {
  if(!Array.isArray(manifest?.destinations))throw Error('Missing destination manifest');
  const selected={...manifest,destinations:system==='all'?manifest.destinations:manifest.destinations.filter(d=>d.system===system)};
  if(!selected.destinations.length)throw Error('No destinations in manifest for '+system);
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
  const system=o.system??'Kashyyyk';
  const manifest=JSON.parse(fs.readFileSync(o.manifest,'utf8'));
  const expectedSystems=[...new Set(manifest.destinations.filter(d=>system==='all'||d.system===system).map(d=>d.system))];
  const load=(f,k)=>csv(fs.readFileSync(path.join(o['web-dir'],f+'-'+k+'.csv'),'utf8'));
  const webStations=['tff','tjo'].flatMap(f=>load(f,'stations'));
  const webMaterials=['tff','tjo'].flatMap(f=>load(f,'materials'));
  const apiStations=['tff','tjo'].flatMap(f=>loadApi(o['api-dir'],f,'stations',system,expectedSystems).map(normalizeStation));
  const apiMaterials=['tff','tjo'].flatMap(f=>loadApi(o['api-dir'],f,'materials',system,expectedSystems).map(normalizeMaterial));
  const report=compareLedgers(manifest,webStations,webMaterials,apiStations,apiMaterials,system);
  fs.mkdirSync(path.dirname(o.out),{recursive:true});
  fs.writeFileSync(o.out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.statistics));
  if(report.differences.length)process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))
  try{main(process.argv.slice(2))}catch(e){console.error(e.stack);process.exitCode=1}
