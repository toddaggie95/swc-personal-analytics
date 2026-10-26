// Read-only adapter for audited production order coordinates and live sheet rows.
// Requires exact station UID mapping; never infers a station from nearby coordinates.
export function mapProductionOrders({auditedOrders,manifest,stations,rowsBySystem,shipBills}) {
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
 for(const entry of auditedOrders){
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
   const first=String(rows[1]?.[0]??'');
   // Find exact hub heading in row 2, not just a coordinate match.
   const heads=rows[1]??[];
   const matches=[];
   for(let i=0;i<heads.length;i++)if(String(heads[i]).trim()===String(d.title??''))matches.push(i);
   if(matches.length!==1)throw Error('Ambiguous hub heading '+entry.destinationId);
   col=matches[0];
  }
  const coord=String(row[oneoff?0:col]??'').replace(/[()]/g,'').trim();
  if(coord!==entry.x+','+entry.y)throw Error('Order coordinate mismatch '+entry.system+':'+entry.row);
  const ship=String(row[col+1]??'').trim(),qtyRaw=row[col+2],started=String(row[col+3]??'').trim().toLowerCase();
  if(ship!==entry.ship)throw Error('Audited ship assignment drift '+entry.system+':'+entry.row);
  if(!['','yes','no'].includes(started))throw Error('Invalid Started value '+entry.system+':'+entry.row);
  const possible=byLocation.get([entry.system,entry.x,entry.y].join('|'))??[];
  const matched=possible.filter(x=>x.destinationId=== (oneoff?x.destinationId:d.id) && d.memberStationUids.includes(x.uid));
  if(matched.length!==1)throw Error('Ambiguous station at '+entry.system+':'+entry.x+','+entry.y);
  const station=matched[0];
  if(oneoff && String(row[4]??'').trim()!==station.uid)throw Error('One-off UID mismatch '+station.uid);
  if(used.has(station.uid))throw Error('Station has duplicate orders '+station.uid);
  used.add(station.uid);
  const isAssigned=ship!==''&&ship!=='None';
  const qty=isAssigned?Number(qtyRaw):0;
  if(isAssigned&&(!Number.isSafeInteger(qty)||qty<=0))throw Error('Invalid order quantity '+station.uid);
  const bom=isAssigned?shipBills.get(ship):null;
  if(isAssigned&&!bom)throw Error('Unverified ship material bill '+ship);
  const bill=Object.fromEntries(Object.entries(bom??{}).map(([m,n])=>[m,n*qty]));
  if(Object.values(bill).some(x=>!Number.isSafeInteger(x)))throw Error('Material multiplication overflow '+station.uid);
  output.push({id:station.uid,stationPoolId:station.uid,system:entry.system,destinationId:station.destinationId,ship,quantity:qty,started:started==='yes',bill});
 }
 return output;
}
