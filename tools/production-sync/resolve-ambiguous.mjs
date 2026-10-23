/**
 * An ambiguous station can be assigned only if its entire material vector
 * matches exactly one candidate hub's current audited HAS vector.
 * This is evidence for review, not an automatic write authorization.
 */
export function matchAmbiguousStationByHas(stationPiles,candidateHas,materials) {
 const vector=Object.fromEntries(materials.map(m=>[m,0]));
 for(const p of stationPiles) {
  const type=String(p.type_name||'').toLowerCase();
  if(!Object.hasOwn(vector,type))throw Error('Unknown material '+type);
  const qty=Number(p.quantity);
  if(!Number.isSafeInteger(qty)||qty<0)throw Error('Invalid pile quantity');
  vector[type]+=qty;
 }
 const matches=candidateHas.filter(c=>materials.every(m=>Number(c.totals[m])===vector[m]));
 return {stationVector:vector,matches:matches.map(c=>c.id),resolved:matches.length===1?matches[0].id:null,reason:matches.length===1?'unique-full-vector-match':matches.length===0?'no-full-vector-match':'multiple-full-vector-matches'};
}
