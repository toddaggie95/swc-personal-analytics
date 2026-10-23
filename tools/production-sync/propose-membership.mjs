import fs from 'node:fs';
import {csv} from './production-sync.mjs';
import {matchStationsToOrders} from './order-membership.mjs';

/** Build a reviewable membership proposal; do not silently claim all nearby
 * stations or inventory depots belong to a production block.
 */
export function proposeMembership(layout,orderFile,stations){
 const destinations=(layout.destinations||layout).map(d=>({...d,memberStationUids:[...(d.memberStationUids||[])]}));
 const oneoffUids=new Set(destinations.filter(d=>d.kind==='oneoff-group').flatMap(d=>d.memberStationUids));
 const unique=new Map();
 for(const s of stations){if(s.uid&&!unique.has(s.uid))unique.set(s.uid,s)}
 const shipyards=[...unique.values()].filter(s=>/shipyard/i.test(s.type_name||'')&&!oneoffUids.has(s.uid));
 const matching=matchStationsToOrders(shipyards,orderFile.orders||orderFile);
 const byDest=new Map(destinations.map(d=>[d.id,d]));
 for(const m of matching.matches){
  const d=byDest.get(m.destinationId);
  if(!d||d.kind!=='hub')throw Error('Order references missing/non-hub destination '+m.destinationId);
  d.memberStationUids.push(m.uid);
 }
 const emptyHubs=destinations.filter(d=>d.kind==='hub'&&!d.memberStationUids.length).map(d=>d.id);
 const report={schemaVersion:1,status:'REVIEW_REQUIRED',destinations,
  unresolved:{unlistedShipyards:matching.unlisted,ambiguousShipyards:matching.ambiguous,emptyHubs},
  statistics:{...matching.statistics,hubCount:destinations.filter(d=>d.kind==='hub').length,oneoffGroups:destinations.filter(d=>d.kind==='oneoff-group').length,emptyHubs:emptyHubs.length},
  warning:'Membership covers audited production-order shipyards ONLY; material-bearing depot/factory stations require separate review. This is NOT an approved inventory config.'};
 return report;
}
export function run(args){
 const opt={};for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Expected --flag value pairs');opt[args[i].slice(2)]=args[i+1]}
 for(const k of ['layout','orders','tff-stations','tjo-stations','out'])if(!opt[k])throw Error('Missing --'+k);
 const load=k=>csv(fs.readFileSync(opt[k],'utf8'));
 const report=proposeMembership(JSON.parse(fs.readFileSync(opt.layout,'utf8')),JSON.parse(fs.readFileSync(opt.orders,'utf8')),[...load('tff-stations'),...load('tjo-stations')]);
 fs.writeFileSync(opt.out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.statistics));
 if(report.unresolved.ambiguousShipyards.length)process.exitCode=2;
}
if(process.argv[1]?.endsWith('propose-membership.mjs'))try{run(process.argv.slice(2))}catch(e){console.error(e.message);process.exitCode=1}
