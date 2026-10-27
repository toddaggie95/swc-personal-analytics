// Fail-closed coverage audit: every populated hub production row must be represented
// by the audited production order registry before any readiness totals are trusted.
export function auditOrderCoverage({manifest,auditedOrders,rowsBySystem}) {
 const audited=new Set(auditedOrders.map(o=>[o.destinationId,o.row].join('|')));
 const missing=[],unmappedOneoffs=[],checked=[];
 for(const d of manifest.destinations){
  const rows=rowsBySystem[d.system];
  if(!rows)throw Error('Missing live tab '+d.system);
  if(d.kind==='oneoff-group'){
   for(const one of d.oneoffs??[]){
    const row=one.row,values=rows[row]??[];
    const ship=String(values[1]??'').trim();
    const uid=String(values[4]??'').trim();
    if(uid!==one.stationUid)unmappedOneoffs.push({system:d.system,destinationId:d.id,row,uid,expectedUid:one.stationUid,ship});
   }
   continue;
  }
  if(d.kind!=='hub')throw Error('Unknown destination kind '+d.kind);
  const headerRow=d.target.materialStartRow-11,col=d.target.hasColumn-2;
  if(!String(rows[headerRow]?.[col]??'').includes('('+d.center.x+','+d.center.y+')'))throw Error('Hub center heading drift '+d.id);
  for(let row=headerRow+1;row<=headerRow+9;row++){
   const values=rows[row]??[],ship=String(values[col+1]??'').trim();
   if(!String(values[col]??'').trim())continue;
   if(!ship||ship==='None')continue;
   const key=d.id+'|'+row;
   checked.push(key);
   if(!audited.has(key))missing.push({system:d.system,destinationId:d.id,row,ship});
  }
 }
 const orphaned=auditedOrders.filter(o=>!checked.includes(o.destinationId+'|'+o.row));
 return {status:missing.length||unmappedOneoffs.length||orphaned.length?'blocked':'complete',auditedOrders:auditedOrders.length,checkedOrders:checked.length,missing,unmappedOneoffs,orphaned};
}
