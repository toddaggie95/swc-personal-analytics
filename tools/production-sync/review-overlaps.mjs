/**
 * Review overlapping candidate hub memberships with normalized SWC tags.
 * An exact tag match to one audited hub title is evidence, not permission to write.
 * Special split hubs (1/2), (2/2) deliberately stay unresolved if the tag
 * matches both; a material-vector comparison or manual review is required.
 */
export function reviewByTags(stations,hubCandidates) {
 const byUid=new Map();
 for(const hub of hubCandidates)for(const uid of hub.candidateStationUids||[]){
  const hits=byUid.get(uid)||[];hits.push(hub);byUid.set(uid,hits);
 }
 const normalize=v=>String(v||'').toLowerCase().replace(/\(\d+\/\d+\)/g,'').replace(/\(\s*\d+\s*,\s*\d+\s*\)/g,'').replace(/\bdepot\b/g,'').replace(/\s+/g,' ').trim();
 const results=[];
 for(const s of stations) {
  const hubs=byUid.get(s.uid)||[];
  if(hubs.length<2)continue;
  const tags=String(s.tags||'').split(/[,;|]/).map(normalize).filter(Boolean);
  const matched=hubs.filter(h=>tags.some(t=>normalize(h.title)===t));
  results.push({uid:s.uid,system:s.system,coordinates:[Number(s.sysX),Number(s.sysY)],
   tags:s.tags||'',candidates:hubs.map(h=>({id:h.id,title:h.title})),
   matched:matched.map(h=>h.id),
   proposedId:matched.length===1?matched[0].id:null,
   evidence:matched.length===1?'unique-exact-tag':matched.length===0?'no-exact-tag':'ambiguous-tag'});
 }
 return results;
}
