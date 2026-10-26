import fs from 'node:fs';
import {csv,MATERIALS} from './production-sync.mjs';
export function systemInventory(stations,materials,manifest){
 const owned=new Map(),piles=new Map(),errors=[],systemTotals={},productionTotals={};
 const zeros=()=>Object.fromEntries(MATERIALS.map(m=>[m,0]));
 const members=new Set(manifest.destinations.flatMap(d=>d.memberStationUids||[]));
 const systems=[...new Set(manifest.destinations.map(d=>d.system))].sort();
 for(const sys of systems){systemTotals[sys]=zeros();productionTotals[sys]=zeros()}
 for(const s of stations){if(!s.uid)throw Error('Station without UID');const prev=owned.get(s.uid);if(prev&&(prev.system!==s.system||prev.sysX!==s.sysX||prev.sysY!==s.sysY))throw Error('Station conflict '+s.uid);owned.set(s.uid,s)}
 const unassigned={},excluded={nonStation:0,inaccessible:0,outsideTrackedSystems:0};
 for(const p of materials){
  if(!p.uid)throw Error('Pile missing UID');
  const sig=[p.type_name,p.quantity,p.system,p.container_type_name,p.container_uid].join('|');
  if(piles.has(p.uid)){if(piles.get(p.uid)!==sig)throw Error('Conflicting pile '+p.uid);continue}piles.set(p.uid,sig);
  if(p.container_type_name!=='Stations'){excluded.nonStation++;continue}
  const station=owned.get(p.container_uid);if(!station){excluded.inaccessible++;continue}
  if(!Object.hasOwn(systemTotals,station.system)){excluded.outsideTrackedSystems++;continue}
  if(p.system&&p.system!==station.system){errors.push({pile:p.uid,reason:'pile-station-system-mismatch',pileSystem:p.system,stationSystem:station.system});continue}
  const mat=p.type_name?.toLowerCase();const qty=Number(p.quantity);
  if(!MATERIALS.includes(mat)||!Number.isSafeInteger(qty)||qty<0){errors.push({pile:p.uid,reason:'invalid-material-or-quantity',material:mat,quantity:p.quantity});continue}
  systemTotals[station.system][mat]+=qty;
  if(members.has(station.uid))productionTotals[station.system][mat]+=qty;
  else {const key=station.system;const item=unassigned[key]??={totals:zeros(),stations:{}};item.totals[mat]+=qty;const v=item.stations[station.uid]??={name:station.name,coordinates:[station.sysX,station.sysY],pileCount:0};v.pileCount++}
 }
 const discrepancies=[];
 for(const sys of systems)for(const m of MATERIALS){const total=systemTotals[sys][m],prod=productionTotals[sys][m],reserve=unassigned[sys]?.totals[m]||0;if(total!==prod+reserve)discrepancies.push({sys,m,total,prod,reserve})}
 return {schemaVersion:1,systems,materials:MATERIALS,systemTotals,productionTotals,unassigned,excluded,errors,discrepancies,statistics:{systems:systems.length,systemHasCells:systems.length*MATERIALS.length,uniquePiles:piles.size,errors:errors.length,invariantFailures:discrepancies.length}};
}
function main(){
 const [tffS,tjoS,tffM,tjoM,manifestPath,out]=process.argv.slice(2);
 if(!out)throw Error('Usage: node system-has-audit.mjs tff-stations tjo-stations tff-materials tjo-materials manifest out');
 const load=p=>csv(fs.readFileSync(p,'utf8'));
 const result=systemInventory([...load(tffS),...load(tjoS)],[...load(tffM),...load(tjoM)],JSON.parse(fs.readFileSync(manifestPath,'utf8')));
 fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.statistics));if(result.errors.length||result.discrepancies.length)process.exitCode=1;
}
if(process.argv[1]?.endsWith('system-has-audit.mjs'))try{main()}catch(e){console.error(e);process.exitCode=1}
