// Read-only material balance for production overview. Physical station inventory is
// counted once per station; only unstarted assigned orders create future demand.
import {MATERIALS} from './production-sync.mjs';
const safe=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid '+label);return n;};
const median=a=>{const b=[...a].sort((x,y)=>x-y);return b.length?b[Math.floor((b.length-1)/2)]:0;};
export function calculateMaterialBalance({pools,orders,materials=MATERIALS,excessThresholds=null}) {
 const known=new Set(materials),bySystem=new Map(),seen=new Set(),poolIds=new Set();
 const trackedSystems=new Set(orders.map(o=>o.system));
 const init=system=>{if(!bySystem.has(system))bySystem.set(system,{system,have:Object.fromEntries(materials.map(m=>[m,0])),required:Object.fromEntries(materials.map(m=>[m,0]))});return bySystem.get(system)};
 for(const pool of pools){
  if(!pool.id||!pool.system||poolIds.has(pool.id))throw Error('Invalid/duplicate inventory pool');
  poolIds.add(pool.id);
  if(!trackedSystems.has(pool.system))continue;
  const rec=init(pool.system);
  for(const [material,quantity] of Object.entries(pool.materials)){
   if(!known.has(material))throw Error('Unknown inventory material '+material);
   rec.have[material]+=safe(quantity,'inventory quantity');
   safe(rec.have[material],'inventory sum');
  }
 }
 for(const order of orders){
  if(!order.id||seen.has(order.id))throw Error('Duplicate/missing production order');
  seen.add(order.id);
  if(!order.system||!poolIds.has(order.stationPoolId))throw Error('Order missing physical station '+order.id);
  const rec=init(order.system);
  if(order.started||!order.ship||order.ship==='None')continue;
  for(const [material,quantity] of Object.entries(order.bill??{})){
   if(!known.has(material))throw Error('Unknown bill material '+material);
   rec.required[material]+=safe(quantity,'required quantity');
   safe(rec.required[material],'required sum');
  }
 }
 const systems=[...bySystem.values()].sort((a,b)=>a.system.localeCompare(b.system));
 const thresholds=Object.fromEntries(materials.map(material=>{
  if(excessThresholds && material in excessThresholds)return [material,safe(excessThresholds[material],'excess threshold')];
  // Provisional: median of positive SYSTEM holdings, minimum one unit.
  return [material,Math.max(1,median(systems.map(s=>s.have[material]).filter(n=>n>0)))];
 }));
 const totals={have:{},required:{},missing:{},excess:{},net:{}};
 const detail=systems.map(system=>{
  const values={};
  for(const material of materials){
   const have=system.have[material],required=system.required[material],net=have-required;
   const missing=Math.max(0,-net),excess=Math.max(0,net);
   values[material]={have,required,net,missing,excess,showExcess:excess>=thresholds[material]&&excess>0};
   for(const [field,value] of Object.entries({have,required,missing,excess,net}))totals[field][material]=(totals[field][material]??0)+value;
  }
  return {system:system.system,materials:values};
 });
 // Net is additive, but positive/negative balances are intentionally summed
 // separately: do not net one system's shortage against another's surplus.
 for(const material of materials)if(totals.have[material]-totals.required[material]!==totals.net[material]||totals.excess[material]-totals.missing[material]!==totals.net[material])throw Error('Material conservation failure '+material);
 const visible=detail.flatMap(s=>materials.flatMap(m=>{
  const v=s.materials[m],out=[];
  if(v.missing)out.push({system:s.system,material:m,kind:'Missing',quantity:v.missing});
  if(v.showExcess)out.push({system:s.system,material:m,kind:'Excess',quantity:v.excess});
  return out;
 }));
 // Both proposed layouts are projections of the SAME canonical records.
 const horizontal=detail.map(s=>({system:s.system,missing:Object.fromEntries(materials.map(m=>[m,s.materials[m].missing])),excess:Object.fromEntries(materials.map(m=>[m,s.materials[m].showExcess?s.materials[m].excess:null]))}));
 const belowTable=visible;
 return {schemaVersion:1,materials,thresholds,systems:detail,totals,visible,horizontal,belowTable,statistics:{systems:systems.length,missingCells:visible.filter(x=>x.kind==='Missing').length,excessCells:visible.filter(x=>x.kind==='Excess').length,thresholdMethod:excessThresholds?'explicit':'median_positive_system_holdings_provisional'}};
}
