// Read-only adapter for audited production order coordinates and live sheet rows.
// Requires exact station UID mapping; never infers a station from nearby coordinates.
export function mapProductionOrders({auditedOrders,manifest,stations,rowsBySystem,shipBills,liveOrders=false}) {
 const stationByUid=new Map(stations.map(s=>[s.uid,s]));
 const byLocation=new Map(),byUid=new Map();
 for(const d of manifest.destinations){
  for(const uid of d.memberStationUids){
   const s=stationByUid.get(uid);
   if(!s)throw Error('Audited station missing '+uid);
   const key=[s.system,Number(s.sysX),Number(s.sysY)].join('|');
   if(!byLocation.has(key))byLocation.set(key,[]);
   const destinationId=d.kind==='oneoff-group'?d.id+':'+uid:d.id;
   const item={uid,destinationId,system:s.system};
   byLocation.get(key).push(item);byUid.set(uid,item);
  }
 }
 const output=[],used=new Set();
 const completeOrders=[...auditedOrders];
 if(!liveOrders)for(const d of manifest.destinations.filter(x=>x.kind==='oneoff-group'))for(const one of d.oneoffs??[]){
  const row=one.row+(d.system==='Tholatin'?0:1),values=rowsBySystem[d.system]?.[row];
  if(!values)throw Error('Missing one-off row '+d.system+':'+row);
  const coord=String(values[0]??'').replace(/[()]/g,'').trim();
  if(coord!==String(one.coordinate).replace(/[()]/g,'').trim())throw Error('One-off coordinate drift '+d.system+':'+row);
  if(String(values[4]??'').trim()!==one.stationUid)throw Error('One-off UID drift '+d.system+':'+row);
  const [x,y]=coord.split(',').map(Number);
  completeOrders.push({destinationId:d.id,system:d.system,x,y,ship:String(values[1]??'').trim(),row});
 }
 for(const entry of completeOrders){
  const rows=rowsBySystem[entry.system];
  if(!rows)throw Error('Missing live system tab '+entry.system);
  const row=rows[entry.row];
  if(!row)throw Error('Missing order row '+entry.system+':'+entry.row);
  const d=manifest.destinations.find(x=>x.id===entry.destinationId);
  if(!d)throw Error('Unknown audited destination '+entry.destinationId);
  // Hub block starts at A, F, K, P, ...; one-offs use B ship / C qty / D started / E UID.
  const oneoff=d.kind==='oneoff-group';
  let col=0;
  if(!oneoff){
   // Find exact hub heading in row 2, not just a coordinate match.
   const headerRow=d.target.materialStartRow-11;
   const heads=rows[headerRow]??[];
   col=d.target.hasColumn-2;
   if(col<0 || !String(heads[col]??'').includes('('+d.center.x+','+d.center.y+')'))throw Error('Hub center heading mismatch '+entry.destinationId);
  }
  const coord=String(row[oneoff?0:col]??'').replace(/[()]/g,'').trim();
  if(coord!==entry.x+','+entry.y)throw Error('Order coordinate mismatch '+entry.system+':'+entry.row);
  const ship=String(row[col+1]??'').trim(),qtyRaw=row[col+2],started=String(row[col+3]??'').trim().toLowerCase();
  if(!oneoff && ship!==entry.ship)throw Error('Audited ship assignment drift '+entry.system+':'+entry.row);
  if(!['','yes','no'].includes(started))throw Error('Invalid Started value '+entry.system+':'+entry.row);
  const possible=byLocation.get([entry.system,entry.x,entry.y].join('|'))??[];
  const matched=possible.filter(x=>d.memberStationUids.includes(x.uid) && (!oneoff || x.uid===String(row[4]??'').trim()));
  if(matched.length!==1)throw Error('Ambiguous station at '+entry.system+':'+entry.x+','+entry.y);
  const station=matched[0];
  // Inventory hyperlinks must use the station owner's faction inventory.
  // TFF=1174, TJO=1838; never infer ownership from the station name.
  const source=stationByUid.get(station.uid);
  const ownerUid=String(source?.owner_uid??'');
  const ownerMatch=/^20:(1174|1838)$/.exec(ownerUid);
  // Legacy synthetic test fixtures omit ownership. Publication validation fails closed
  // if an actual readiness order has no recognized owner; no link is inferred.
  const ownerFaction=ownerMatch?(ownerMatch[1]==='1174'?'TFF':'TJO'):null;
  if(oneoff && String(row[4]??'').trim()!==station.uid)throw Error('One-off UID mismatch '+station.uid);
  if(used.has(station.uid))throw Error('Station has duplicate orders '+station.uid);
  used.add(station.uid);
  const isAssigned=ship!==''&&ship!=='None';
  const qty=isAssigned?Number(qtyRaw):0;
  if(isAssigned&&(!Number.isSafeInteger(qty)||qty<=0))throw Error('Invalid order quantity '+station.uid);
  // Started production consumes no new materials in this planner; its bill is not needed.
  const bom=isAssigned&&started!=='yes'?shipBills.get(ship):null;
  if(isAssigned&&started!=='yes'&&!bom)throw Error('Unverified ship material bill '+ship);
  const bill=Object.fromEntries(Object.entries(bom??{}).map(([m,n])=>[m,n*qty]));
  if(Object.values(bill).some(x=>!Number.isSafeInteger(x)))throw Error('Material multiplication overflow '+station.uid);
  output.push({id:station.uid,stationPoolId:station.uid,ownerFaction,ownerFactionId:ownerMatch?.[1]??null,system:entry.system,destinationId:station.destinationId,ship,quantity:qty,started:started==='yes',bill});
 }
 return output;
}
