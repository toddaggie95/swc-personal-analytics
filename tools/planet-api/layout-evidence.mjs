import{hash}from'./planet-capture.mjs';
// Mapping is learned from independently identified buildings, never from equal numeric IDs.
export function parseObservedLayout(text){
 if(typeof text!=='string')throw Error('layout-missing');
 const rows=text.split('|')[0].split(';').filter(Boolean).map(token=>{
  if(!/^\d+,-?\d+,-?\d+,[vh]$/.test(token))throw Error('layout-grammar');
  const[id,x,y,orientation]=token.split(',');return{designerId:Number(id),x:Number(x),y:Number(y),orientation};
 });
 const seen=new Set();for(const row of rows){const key=row.x+','+row.y;if(seen.has(key))throw Error('layout-anchor-duplicate');seen.add(key);}
 return rows;
}
export function learnCrosswalk(cities,observations){
 const layouts=new Map(cities.map(c=>[c.uid,new Map(parseObservedLayout(c.layout).map(p=>[p.x+','+p.y,p]))]));
 const types=new Map(),discrepancies=[];
 for(const row of observations){
  if(!row.source||!/^4:\d+$/.test(row.typeUid))throw Error('crosswalk-source');
  const anchor=layouts.get(row.cityUid)?.get((row.x-1)+','+(row.y-1));
  if(!anchor){discrepancies.push({cityUid:row.cityUid,uid:row.uid??null,code:'no_corresponding_layout_anchor'});continue;}
  if(!types.has(anchor.designerId))types.set(anchor.designerId,{designerId:anchor.designerId,typeUid:row.typeUid,witnesses:[]});
  const t=types.get(anchor.designerId);if(t.typeUid!==row.typeUid)throw Error('crosswalk-conflicting-type');
  t.witnesses.push({cityUid:row.cityUid,x:row.x,y:row.y,source:row.source});
 }
 const result={schemaVersion:1,kind:'observed_api_designer_crosswalk',coordinateMapping:'Inventory one-based ground coordinates minus 1 equals layout anchor coordinates; independently matched observations only.',types:[...types.values()],discrepancies};
 result.contentSha256=hash(result);return result;
}
export function layoutSupplement(snapshot,cityEntries,crosswalk){
 const {contentSha256,...body}=crosswalk;if(hash(body)!==contentSha256)throw Error('crosswalk-integrity');
 const mappings=new Map(crosswalk.types.map(t=>[t.designerId,t.typeUid])),catalog=new Set(snapshot.catalog.map(t=>t.uid));
 const sources=[],gaps=[];
 for(const e of cityEntries.filter(e=>e.status==='observed')){
  const rows=snapshot.facilities.filter(f=>f.cityUid===e.uid),layout=parseObservedLayout(e.data.layout),anchors=new Map(layout.map(p=>[(p.x+1)+','+(p.y+1),p]));
  if(layout.length!==rows.length){gaps.push({cityUid:e.uid,code:'layout-building-count-mismatch',layout:layout.length,buildings:rows.length});continue;}
  const supplements=[];let failed=false;
  for(const f of rows){
   const p=anchors.get(f.x+','+f.y),type=p&&mappings.get(p.designerId);
   if(!p||!type||!catalog.has(type)){gaps.push({cityUid:e.uid,uid:f.uid,code:'unmapped_layout_anchor'});failed=true;continue;}
   if(f.typeUid&&f.typeUid!==type){gaps.push({cityUid:e.uid,uid:f.uid,code:'known_type_conflicts_with_layout'});failed=true;}
   if(!f.typeUid)supplements.push({uid:f.uid,planetUid:snapshot.planet.uid,layer:'actual',typeUid:type});
  }
  if(!failed&&supplements.length)sources.push({source:{id:e.source.id+':layout',reference:'Observed city layout '+e.uid+'; independently evidenced crosswalk '+crosswalk.contentSha256,currency:'current',observedAt:e.source.observedAt,sha256:e.source.sha256},facilities:supplements});
 }
 return{sources,gaps};
}
