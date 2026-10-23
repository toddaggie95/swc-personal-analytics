/**
 * The audited workbook's explicit order coordinates take precedence over
 * overlapping 3x3 proximity and missing/inconsistent tags.
 * Require exactly one matching production block in the SAME system.
 * A single location may have several stations; all belong to that one
 * block only when its order coordinate is unambiguous.
 */
export function matchStationsToOrders(stations,orders) {
 const key=(system,x,y)=>[system,Number(x),Number(y)].join('|');
 const destinations=new Map();
 for(const o of orders){
  if(!o.destinationId||!o.system||!Number.isInteger(o.x)||!Number.isInteger(o.y))throw Error('Invalid audited order');
  const k=key(o.system,o.x,o.y);
  const ids=destinations.get(k)||new Set();ids.add(o.destinationId);destinations.set(k,ids);
 }
 const matches=[],unlisted=[],ambiguous=[];
 for(const s of stations){
  if(!s.uid)continue;
  const k=key(s.system,s.sysX,s.sysY),ids=[...(destinations.get(k)||[])];
  const row={uid:s.uid,system:s.system,x:Number(s.sysX),y:Number(s.sysY),candidateDestinationIds:ids};
  if(ids.length===1)matches.push({...row,destinationId:ids[0]});
  else if(ids.length>1)ambiguous.push(row);
  else unlisted.push(row);
 }
 return {matches,ambiguous,unlisted,statistics:{matched:matches.length,ambiguous:ambiguous.length,unlisted:unlisted.length}};
}
