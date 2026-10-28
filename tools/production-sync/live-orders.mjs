// Derive production assignments from live sheet rows, never a cached GitHub order list.
// Manifest supplies hub geometry and station UIDs only. Fail closed on coordinate drift.
export function liveProductionOrders({manifest,stations,rowsBySystem}) {
 const byUid=new Map(stations.map(s=>[s.uid,s]));
 const result=[],seen=new Set();
 const coord=(value)=>String(value??'').replace(/[()]/g,'').replace(/\s/g,'');
 for(const d of manifest.destinations){
  const rows=rowsBySystem[d.system];
  if(!rows)throw Error('Missing live system tab '+d.system);
  if(d.kind==='hub'){
   const col=d.target.hasColumn-2,headerRow=d.target.materialStartRow-11;
   if(!String(rows[headerRow]?.[col]??'').includes('('+d.center.x+','+d.center.y+')'))throw Error('Hub heading drift '+d.id);
   const expected=new Map();
   for(const uid of d.memberStationUids){
    const s=byUid.get(uid);
    if(!s||s.system!==d.system)throw Error('Missing or misplaced audited hub station '+uid);
    const key=s.sysX+','+s.sysY;
    if(expected.has(key))throw Error('Duplicate station coordinate in hub '+d.id+':'+key);
    expected.set(key,uid);
   }
   const found=new Set();
   for(let row=headerRow+1;row<=headerRow+9;row++){
    const values=rows[row]??[],xy=coord(values[col]);
    if(!xy){
     if(String(values[col+1]??'').trim()&&String(values[col+1]).trim()!=='None')throw Error('Assigned ship without coordinate '+d.id+':'+row);
     continue;
    }
    if(!/^-?\d+,-?\d+$/.test(xy))throw Error('Malformed hub coordinate '+d.id+':'+row);
    const uid=expected.get(xy);
    if(!uid){
     // The audited layout can display a vacant orbital slot without a station UID.
     // Such a row is valid only when explicitly unassigned and has no start flag.
     const ship=String(values[col+1]??'').trim(),qty=String(values[col+2]??'').trim(),started=String(values[col+3]??'').trim();
     const [x,y]=xy.split(',').map(Number);
     if(Math.abs(x-d.center.x)>1||Math.abs(y-d.center.y)>1||!['','None'].includes(ship)||(qty&&qty!=='0')||started)
      throw Error('Unknown station coordinate '+d.id+':'+xy);
     continue;
    }
    if(found.has(uid)||seen.has(uid))throw Error('Duplicate live production station '+uid);
    found.add(uid);seen.add(uid);
    const [x,y]=xy.split(',').map(Number);
    result.push({destinationId:d.id,system:d.system,x,y,row,ship:String(values[col+1]??'').trim()});
   }
   // A non-producing depot/storage member need not occupy a production-order row.
   // Every omitted member must be a non-shipyard; never silently lose a shipyard.
   for(const [xy,uid] of expected)if(!found.has(uid)){
    const station=byUid.get(uid);
    if(/shipyard/i.test(String(station?.type_name??'')))
     throw Error('Hub production shipyard coverage incomplete '+d.id+': '+xy+' ('+uid+')');
   }
  }else if(d.kind==='oneoff-group'){
   for(const one of d.oneoffs??[]){
    const uid=one.stationUid,s=byUid.get(uid);
    if(!s||s.system!==d.system)throw Error('Missing audited one-off station '+uid);
    // Historic manifest stores zero-based row offsets, except Tholatin.
    const row=one.row+(d.system==='Tholatin'?0:1),values=rows[row]??[];
    if(coord(values[0])!==coord(one.coordinate)||coord(values[0])!==s.sysX+','+s.sysY||String(values[4]??'').trim()!==uid)throw Error('One-off UID/coordinate drift '+d.system+':'+row);
    if(seen.has(uid))throw Error('Duplicate one-off station '+uid);
    seen.add(uid);
    result.push({destinationId:d.id,system:d.system,x:Number(s.sysX),y:Number(s.sysY),row,ship:String(values[1]??'').trim()});
   }
  }else throw Error('Unknown destination kind '+d.kind);
 }
 return result;
}
