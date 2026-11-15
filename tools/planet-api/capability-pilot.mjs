// Bounded schema/coverage discovery. No economic model or inferred parameters.
export const record = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export function unwrap(value) {
  if (!value || typeof value !== 'object' || !value.swcapi) throw Error('envelope');
  const root = record(value.swcapi);
  if ('error' in root) throw Error('api-error');
  return Object.keys(root).length === 1 ? record(Object.values(root)[0]) : root;
}
export function uid(value) {
  const obj = record(value);
  return typeof obj.uid === 'string' ? obj.uid : record(obj.attributes).uid;
}
export function fieldPaths(value, prefix = '', depth = 0) {
  if (depth > 9) return [];
  if (Array.isArray(value)) return [...new Set(value.slice(0, 200).flatMap(v => fieldPaths(v, prefix + '[]', depth + 1)))].sort();
  if (value && typeof value === 'object') return Object.keys(value).sort().flatMap(key =>
    fieldPaths(value[key], prefix ? prefix + '.' + key : key, depth + 1));
  return [prefix];
}
export function validatePage(data, planetUid, ownerUid, entityPrefix) {
  const entities = record(data.entities), a = record(entities.attributes);
  const rows = entities.entity;
  const num = x => typeof x === 'number' || typeof x === 'string' && x.trim() ? Number(x) : NaN;
  const total = num(a.total), start = num(a.start), count = a.count == null && Array.isArray(rows) ? rows.length : num(a.count);
  if (!Array.isArray(rows) || ![total,start,count].every(Number.isSafeInteger) || total < 0 || start !== 1 ||
      count < 0 || count > 200 || count !== rows.length || count > total || total > 0 && count === 0) throw Error('pagination');
  const seen = new Set();
  const values = rows.map(row => record(row.value && typeof row.value === 'object' ? row.value : row));
  for (const row of values) {
    const id = uid(row);
    if (typeof id !== 'string' || !new RegExp('^' + entityPrefix + ':\\d+$').test(id) || seen.has(id) ||
        uid(record(row.location).planet) !== planetUid || uid(row.owner) !== ownerUid) throw Error('coverage');
    seen.add(id);
  }
  return {total, returned: values.length, complete: values.length === total, rows: values};
}
export function allowedEndpoint(endpoint) {
  try {if(decodeURIComponent(endpoint).split('/').some(p=>p==='.'||p==='..'))return false;}catch{return false;}
  return endpoint === 'character/' || /^galaxy\/planets\/[A-Za-z0-9%._~-]+\/$/.test(endpoint) ||
    /^galaxy\/cities\/13:\d+$/.test(endpoint) || /^inventory\/planets\/8:\d+$/.test(endpoint) ||
    /^inventory\/cities\/13:\d+$/.test(endpoint) || /^inventory\/facilities\/4:\d+$/.test(endpoint) ||
    /^inventory\/20:\d+\/(facilities|cities)\/owner$/.test(endpoint) ||
    endpoint === 'types/facilities/' || /^types\/facilities\/\d+:\d+$/.test(endpoint);
}
export async function collectPilot(request, {planetName, factionName, save}) {
  if (!planetName || planetName.length > 100 || !/^[A-Za-z0-9 .'-]+$/.test(planetName)) throw Error('planet-name');
  const report = {schemaVersion:1, mode:'bounded_capability_pilot', completePhysicalPlanet:false,
    observedFrom:new Date().toISOString(), resources:[], gaps:[], generationTimeKnown:false};
  async function read(label, endpoint, query = {}) {
    if (!allowedEndpoint(endpoint)) throw Error('endpoint');
    const result = await request(endpoint, query);
    const entry = {label, endpoint, status:result.status, observedAt:new Date().toISOString(), fields:[]};
    report.resources.push(entry);
    if ([403,404].includes(result.status)) {entry.availability=result.status===403?'permission_denied':'not_found';return null;}
    if (result.status !== 200) throw Error('request-stopped');
    const data = unwrap(result.body);
    entry.availability='observed';entry.fields=fieldPaths(data);
    return data;
  }
  try {
    const me = await read('character','character/');
    const factions = Array.isArray(me.factions) ? me.factions.filter(f=>f.value===factionName) : [];
    const ownerUid = uid(factions[0]);
    if(factions.length!==1 || !/^20:\d+$/.test(ownerUid)) throw Error('faction-identity');
    const planet = await read('galaxy_planet','galaxy/planets/'+encodeURIComponent(planetName)+'/');
    const planetUid = uid(planet);
    if (!/^8:\d+$/.test(planetUid) || planet.name?.toLowerCase()!==planetName.toLowerCase()) throw Error('planet-identity');
    report.planet={uid:planetUid,name:planet.name};report.ownerUid=ownerUid;
    await read('inventory_planet','inventory/planets/'+planetUid);
    const query={start_index:1,item_count:200,'filter_type[0]':'planet','filter_value[0]':planetUid,'filter_inclusion[0]':'includes'};
    const facilities=await read('facility_list','inventory/'+ownerUid+'/facilities/owner',query);
    if(facilities){
      const page=validatePage(facilities,planetUid,ownerUid,'4');
      report.facilityCoverage={total:page.total,returned:page.returned,completeOwnedList:page.complete,allOwners:false};
      const picked=[], types=new Set();
      for(const row of page.rows){const type=uid(row.type);if(!types.has(type)){picked.push(row);types.add(type);}if(picked.length===3)break;}
      for(const row of picked){
        const detail=await read('facility_detail','inventory/facilities/'+uid(row));
        if(detail && (uid(detail)!==uid(row)||uid(detail.owner)!==ownerUid||uid(record(detail.location).planet)!==planetUid)) throw Error('detail-identity');
      }
      for(const type of [...types].filter(t=>/^\d+:\d+$/.test(t)).slice(0,2)) await read('facility_type','types/facilities/'+type);
    }
    const cities=await read('city_list','inventory/'+ownerUid+'/cities/owner',query);
    let cityUid;
    if(cities){
      const page=validatePage(cities,planetUid,ownerUid,'13');
      report.cityCoverage={total:page.total,returned:page.returned,completeOwnedList:page.complete,allOwners:false};
      cityUid=uid(page.rows[0]);
      if(cityUid){const detail=await read('inventory_city','inventory/cities/'+cityUid);if(detail&&uid(detail)!==cityUid)throw Error('city-identity');}
    }
    if(!cityUid){const refs=record(planet.cities).city;cityUid=Array.isArray(refs)?uid(refs[0]):undefined;}
    if(/^13:\d+$/.test(cityUid)){const detail=await read('galaxy_city','galaxy/cities/'+cityUid);if(detail&&uid(detail)!==cityUid)throw Error('city-identity');}
    await read('facility_type_list','types/facilities/',{start_index:1,item_count:200});
    report.gaps.push('Owner inventories do not establish all-owner planetary coverage.',
      'Payout generation time and collection-time operator skill require separate evidence.',
      'No event endpoint or complete planet crawl is included in this pilot.');
    report.status='completed';
  } catch {report.status='stopped';throw Error('Pilot stopped; encrypted diagnostics retained.');}
  finally {report.observedTo=new Date().toISOString();await save(report);}
  return report;
}
