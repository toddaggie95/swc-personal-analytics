// Read-only, same-snapshot readiness comparison for Kashyyyk web CSV and API captures.
// Usage: node tools/api-parity/run-readiness-parity.mjs --snapshot workbook.json --web-dir web --api-dir api --out report.json
// workbook.json must include manifest, rowsBySystem.Kashyyyk, and shipRows.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {csv} from '../production-sync/production-sync.mjs';
import {calculateOverviewSnapshot} from '../production-sync/overview-snapshot.mjs';
import {normalizeStation,normalizeMaterial} from './compare-production-has.mjs';
import {compareReadiness} from './compare-readiness.mjs';

export function compareCapturedReadiness(snapshot,webStations,webMaterials,apiStations,apiMaterials,system='Kashyyyk',previous=null){
  if(!Array.isArray(snapshot?.manifest?.destinations)||!snapshot?.rowsBySystem||!Array.isArray(snapshot?.shipRows))throw Error('Snapshot requires manifest, workbook rows and shipRows');
  const destinations=system==='all'?snapshot.manifest.destinations:snapshot.manifest.destinations.filter(d=>d.system===system);
  if(!destinations.length)throw Error('No '+system+' destinations');
  const systems=[...new Set(destinations.map(d=>d.system))];
  for(const name of systems)if(!Array.isArray(snapshot.rowsBySystem[name]))throw Error('Snapshot requires workbook rows for '+name);
  const manifest={...snapshot.manifest,destinations};
  const input={...snapshot,manifest,rowsBySystem:Object.fromEntries(systems.map(name=>[name,snapshot.rowsBySystem[name]]))};
  const web=calculateOverviewSnapshot({...input,stations:webStations,materials:webMaterials});
  const api=calculateOverviewSnapshot({...input,stations:apiStations,materials:apiMaterials});
  const result=compareReadiness(web,api,previous);
  const count=orders=>Object.fromEntries(['building','ready_now','transfer','blocked','unassigned'].map(k=>[k,orders.filter(o=>o.status===k).length]));
  const statuses={web:count(web.orders),api:count(api.orders)};
  // Historical November 3 baseline is not a valid gate for a later workbook capture.
  // Pass an explicit baseline only when it was captured from the SAME sheet snapshot.
  const expected=system==='Kashyyyk'?(snapshot.expectedKashyyykCounts??{}):(snapshot.expectedCounts??{});
  const sheetCountDifferences=Object.entries(expected).filter(([k,v])=>statuses.web[k]!==v||statuses.api[k]!==v).map(([k,v])=>({status:k,expected:v,web:statuses.web[k],api:statuses.api[k]}));
  return {...result,statistics:{web:statuses.web,api:statuses.api},baselineChecked:Object.keys(expected).length>0,sheetCountDifferences,
    status:result.status==='matched'&&!sheetCountDifferences.length?'matched': 'differences',
    source:'same captured workbook assignments, ship bills and priority; independent web and API station/material inputs'};
}
function args(argv){const o={};for(let i=0;i<argv.length;i+=2){if(!argv[i]?.startsWith('--')||!argv[i+1])throw Error('Expected --key value');o[argv[i].slice(2)]=argv[i+1]}for(const k of ['snapshot','web-dir','api-dir','out'])if(!o[k])throw Error('Missing --'+k);return o}
function apiFile(dir,faction,kind,system){
 const files=fs.readdirSync(dir).filter(n=>n.startsWith(faction+'__'+kind+'__system-')&&n.endsWith('.json'));
 const matches=[];
 for(const name of files){
  const doc=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
  const scope=doc.summary?.locationFilter;
  if(system!=='all'&&scope?.name!==system)continue;
  if(!scope?.uid||!scope?.name||!Array.isArray(doc[kind]))throw Error('Invalid API capture '+name);
  matches.push({name,scope,rows:doc[kind]});
 }
 if(!matches.length)throw Error('No '+faction+' '+kind+' API captures for '+system);
 const scopes=new Set(),uids=new Set(),out=[];
 for(const capture of matches){
  if(scopes.has(capture.scope.uid))throw Error('Duplicate scoped capture '+capture.scope.uid);
  scopes.add(capture.scope.uid);
  for(const row of capture.rows){
   if(!row.uid||uids.has(row.uid)||row.location?.system?.uid!==capture.scope.uid)throw Error('Invalid API entity '+row.uid);
   uids.add(row.uid);out.push(row);
  }
 }
 return out;
}
function main(argv){const o=args(argv),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 const system=o.system??'Kashyyyk';
 const web=(kind)=>['tff','tjo'].flatMap(f=>csv(fs.readFileSync(path.join(o['web-dir'],f+'-'+kind+'.csv'),'utf8')));
 const api=(kind,normalize)=>['tff','tjo'].flatMap(f=>apiFile(o['api-dir'],f,kind,system).map(normalize));
 const result=compareCapturedReadiness(read(o.snapshot),web('stations'),web('materials'),api('stations',normalizeStation),api('materials',normalizeMaterial),system,o.previous?read(o.previous):null);
 fs.mkdirSync(path.dirname(o.out),{recursive:true});fs.writeFileSync(o.out,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,statistics:result.statistics,orderDifferences:result.differences.length,sheetCountDifferences:result.sheetCountDifferences.length},null,2));
 if(result.status!=='matched')process.exitCode=2;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))try{main(process.argv.slice(2))}catch(e){console.error(e.stack);process.exitCode=1}
