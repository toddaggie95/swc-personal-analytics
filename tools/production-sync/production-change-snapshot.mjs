// Convert a verified read-only readiness result into a stable station snapshot.
// The original result remains untouched; no credentials or writes are needed.
export function snapshotFromOverview(result,{batchId=null,capturedAt=null}={}){
 if(result?.mode!=='read_only'||!Array.isArray(result.orders)||!result.statistics)throw Error('Verified readiness result required');
 if(result.statistics.liveOrders!==result.orders.length)throw Error('Production order count mismatch');
 const seen=new Set();
 const stations=result.orders.map(o=>{
  const uid=String(o.id??'').trim();
  if(!uid||seen.has(uid))throw Error('Missing or duplicate station UID '+uid);
  seen.add(uid);
  if(!o.system||!['building','ready_now','transfer','blocked','unassigned'].includes(o.status))throw Error('Invalid station readiness '+uid);
  return {uid,system:o.system,coordinates:o.coordinates??null,sector:o.sector??null,owner:o.ownerFaction??null,ship:o.ship??null,quantity:o.quantity??0,started:o.started===true,status:o.started?'running':'idle',readiness:o.status};
 }).sort((a,b)=>a.uid.localeCompare(b.uid));
 return {schemaVersion:1,batchId,capturedAt,stations};
}
