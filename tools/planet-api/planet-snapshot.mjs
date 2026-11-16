import {record,uid} from './capability-pilot.mjs';
import {hash,verifyPlan,checkFresh} from './planet-capture.mjs';
const n=value=>{
 if(typeof value!=='number'&&typeof value!=='string'||String(value).trim()==='')return null;
 const number=Number(value);return Number.isFinite(number)?number:null;
};
const flag=value=>value===true||value===1||['yes','true','1'].includes(String(value).toLowerCase())?true:
 value===false||value===0||['no','false','0'].includes(String(value).toLowerCase())?false:null;
const name=ref=>typeof ref?.value==='string'?ref.value:null;
function facilityFacts(row,city=null){
 const location=record(row.location),ground=record(record(record(location.coordinates).ground).attributes);
 const coords=city?record(row.attributes):ground;
 return {uid:uid(row),name:row.name??null,images:row.images??null,typeUid:uid(row.type)??null,typeName:name(row.type),ownerUid:uid(row.owner)??null,ownerName:name(row.owner),
  cityUid:city??uid(location.city)??null,x:n(coords.x),y:n(coords.y),orientation:row.orientation??null,
  underConstruction:flag(row.underconstruction),wrecked:flag(row.wrecked),powered:flag(row.ispowered),
  managerUid:uid(row.commander)??null,operatorUid:uid(row.pilot)??null,
  incomeObservation:row.facilityincome??null,incomeGeneratedAt:null,rawState:{underconstruction:row.underconstruction??null,wrecked:row.wrecked??null}};
}
function catalogFacts(row,source){
 const jobs=n(row.jobs),flats=n(row.flats),width=n(row.sizex),height=n(row.sizey);
 const economicFieldsComplete=jobs!==null&&jobs>=0&&flats!==null&&flats>=0&&Number.isInteger(flats)&&Number.isInteger(width)&&Number.isInteger(height)&&width>0&&height>0;
 if(jobs!==null&&Math.abs(jobs*1000000-Math.round(jobs*1000000))>0.00001)throw Error('job-precision');
 return {uid:uid(row),name:row.name,jobs,flats,width,height,area:Number.isInteger(width)&&Number.isInteger(height)?width*height:null,economicFieldsComplete,energyRaw:row.energy??null,
  priceRaw:row.price??null,materials:row.materials??null,source};
}
const emptyTotals=()=>({facilities:0,jobsMicrounits:0,flats:0,area:0});
function add(total,c){total.facilities++;total.jobsMicrounits+=Math.round(c.jobs*1000000);total.flats+=c.flats;total.area+=c.area;}
function display(total){const {jobsMicrounits,...rest}=total;return {...rest,jobs:jobsMicrounits/1000000};}
export function assembleSnapshot(inventory,plan,batches,{ownerClassifications={}}={}){
 verifyPlan(plan);if(plan.inventoryHash!==hash(inventory))throw Error('inventory-plan-mismatch');
 checkFresh(inventory.createdAt);
 const results=new Map();
 for(const batch of batches){if(batch.planIdentity!==plan.identity||batch.runId!==plan.runId||!batch.complete||results.has(batch.id))throw Error('batch-provenance');results.set(batch.id,batch);}
 const entries={cities:[],types:[]};
 for(const expected of plan.batches){const batch=results.get(expected.id);if(!batch||batch.kind!==expected.kind||batch.entries.length!==expected.targets.length)throw Error('batch-coverage');
  const actual=new Map(batch.entries.map(e=>[e.uid,e]));if(actual.size!==batch.entries.length)throw Error('batch-duplicate');
  for(const target of expected.targets){const entry=actual.get(target.uid);if(!entry||!['observed','unavailable'].includes(entry.status))throw Error('target-coverage');
   if(entry.status==='observed'&&uid(entry.data)!==target.uid)throw Error('entry-identity');
   if(entry.status==='unavailable'&&expected.kind==='cities'&&target.expectedOwner)throw Error('owned-city-unavailable');
   entries[expected.kind].push(entry);
  }
 }
 if(results.size!==plan.batches.length)throw Error('extra-batch');
 const catalog=new Map(entries.types.filter(e=>e.status==='observed').map(e=>[e.uid,catalogFacts(e.data,e.source)]));
 const facilities=new Map(),conflicts=[];
 const addObservation=(row,source,city=null)=>{
  const facts=facilityFacts(row,city);if(!/^4:\d+$/.test(facts.uid))throw Error('physical-facility-identity');
  const old=facilities.get(facts.uid);
  if(old){
   for(const field of ['typeUid','ownerUid','cityUid','x','y','orientation','underConstruction','wrecked'])
    if(old[field]!==null&&facts[field]!==null&&old[field]!==facts[field])conflicts.push({uid:facts.uid,field,values:[old[field],facts[field]]});
   for(const [key,value]of Object.entries(facts))if(old[key]===null&&value!==null)old[key]=value;
   old.observations.push(source);
  }else facilities.set(facts.uid,{...facts,observations:[source]});
 };
 for(const doc of inventory.inventories.filter(d=>d.kind==='facilities'&&d.status==='complete'))
  for(const row of doc.rows)addObservation(row,{kind:'owner_inventory',ownerUid:doc.ownerUid,sourceIds:doc.sources.map(s=>s.id)});
 const cities=[];
 for(const entry of entries.cities){if(entry.status!=='observed'){cities.push({uid:entry.uid,status:'unavailable',httpStatus:entry.httpStatus,source:entry.source});continue;}
  const data=entry.data;if(uid(record(data.location).planet)!==plan.planetUid)throw Error('city-planet');
  const rows=record(data.buildings).building;
  if(rows!==undefined&&!Array.isArray(rows))throw Error('city-building-shape');
  // An absent building collection is unknown, not an empty city.
  const knownBuildings=Array.isArray(rows);
  const seen=new Set();for(const row of rows??[]){if(seen.has(uid(row)))throw Error('city-duplicate-building');seen.add(uid(row));
   addObservation(row,{kind:'city_building',cityUid:entry.uid,sourceIds:[entry.source.id]},entry.uid);
  }
  cities.push({uid:entry.uid,name:data.name,ownerUid:uid(data.owner)??null,ownerName:name(data.owner),
   surface:record(record(record(data.location).coordinates).surface).attributes??null,
   layout:data.layout??null,buildingCollectionKnown:knownBuildings,buildingUids:[...seen].sort(),source:entry.source});
 }
 if(conflicts.length)throw Object.assign(Error('conflicting-physical-observations'),{conflicts});
 const byOwner=new Map(),byType=new Map(),total=emptyTotals(),excluded=[],unresolved=[];
 for(const facility of facilities.values()){
  const type=catalog.get(facility.typeUid);
  let reason=null;
  if(!type)reason='missing_type';else if(!type.economicFieldsComplete)reason='missing_type_economics';else if(facility.underConstruction===null)reason='unknown_construction_state';
  else if(facility.underConstruction)reason='under_construction';else if(facility.wrecked===true)reason='wrecked_rule_unverified';
  else if(facility.wrecked===null)reason='unknown_wrecked_state';
  if(reason){facility.contribution={included:false,reason,potential:type?{jobs:type.jobs,flats:type.flats,area:type.area}:null};
   (reason==='under_construction'?excluded:unresolved).push(facility.uid);continue;}
  facility.contribution={included:true,jobs:type.jobs,flats:type.flats,area:type.area,typeSource: type.source.id};
  const ownerKey=facility.ownerUid??'unknown';
  if(!byOwner.has(ownerKey))byOwner.set(ownerKey,{uid:ownerKey,name:facility.ownerName,
   classification:ownerClassifications[ownerKey]??{group:'unclassified',evidence:null},total:emptyTotals()});
  if(!byType.has(facility.typeUid))byType.set(facility.typeUid,{uid:facility.typeUid,name:type.name,total:emptyTotals()});
  add(total,facility.contribution);add(byOwner.get(ownerKey).total,facility.contribution);add(byType.get(facility.typeUid).total,facility.contribution);
 }
 const totals=display(total),observedTo=[inventory.createdAt,...inventory.sources.map(s=>s.observedAt),...entries.cities.map(e=>e.source.observedAt),...entries.types.map(e=>e.source.observedAt)].sort().at(-1);
 checkFresh(inventory.createdAt,Date.parse(observedTo));
 const missingCities=cities.filter(c=>c.status==='unavailable'||!c.buildingCollectionKnown).map(c=>c.uid);
 const sources=[...inventory.sources,...entries.cities.map(e=>e.source),...entries.types.map(e=>e.source)];
 const sourceIds=sources.map(s=>s.id);if(sourceIds.length!==new Set(sourceIds).size)throw Error('duplicate-source-id');
 const snapshot={schemaVersion:1,kind:'planet_reconciliation_snapshot',snapshotId:plan.runId,optimizationReady:false,planet:{uid:plan.planetUid,name:inventory.planet.name,
   publicControls:{size:inventory.planet.size??null,civilisationlevel:inventory.planet.civilisationlevel??null,taxlevel:inventory.planet.taxlevel??null,population:inventory.planet.population??null},
   privateControls:{status:'not_available_known_resource_restriction'}},
  observationWindow:{from:inventory.createdAt,to:observedTo,consistency:'paginated observations; not a transactional snapshot'},
  provenance:{contract:plan.contract,planIdentity:plan.identity,inventoryHash:plan.inventoryHash,sources},
  coverage:{referenceCities:cities.length,observedCities:cities.length-missingCities.length,missingCities,
   ownerInventories:inventory.inventories.map(d=>({ownerUid:d.ownerUid,kind:d.kind,status:d.status,total:d.total})),
   uniqueFacilities:facilities.size,allPhysicalPlanetVerified:false},
  accountingPolicy:{id:'completed-nonwrecked-v1',jobsScale:1000000,underConstruction:'excluded with potential contributions retained',
   plannedFacilities:'not included in this observed snapshot',incomeGenerationTime:'unknown'},
  totals:{includedCompleted:totals,excludedUnderConstruction:excluded.length,unresolvedFacilities:unresolved.length,
   employmentRateFromKnownCompleted:totals.jobs/(totals.flats+0.1),civilisationLevelFromKnownCompleted:null},
  byOwner:[...byOwner.values()].map(o=>({...o,total:display(o.total)})).sort((a,b)=>a.uid.localeCompare(b.uid)),
  byType:[...byType.values()].map(t=>({...t,total:display(t.total)})).sort((a,b)=>a.uid.localeCompare(b.uid)),
  cities,facilities:[...facilities.values()].sort((a,b)=>a.uid.localeCompare(b.uid)),catalog:[...catalog.values()],
  reconciliation:{status:missingCities.length||unresolved.length?'incomplete_coverage':'pending_independent_controls',
   independentControls:[],checks:[],notes:['Observed totals are not proof of all-owner planetary closure.','Income observation time does not establish generation time.']}};
 const size=n(inventory.planet.size);if(size!==null&&Number.isInteger(size)&&size>0)snapshot.totals.civilisationLevelFromKnownCompleted=totals.area/(size*size*484);
 snapshot.contentSha256=hash(snapshot);return snapshot;
}
export function snapshotReport(snapshot){
 const s=snapshot,t=s.totals.includedCompleted;
 return [`# ${s.planet.name} observed planetary baseline`,``,`Snapshot: ${s.snapshotId}`,`Observed: ${s.observationWindow.from} to ${s.observationWindow.to}`,
  `Status: **${s.reconciliation.status}**. This is not yet an independently reconciled full planet.`,``,
  `Known completed totals: **${t.facilities} facilities; ${t.jobs} jobs; ${t.flats} flats; ${t.area} area squares**.`,
  `Unique observed facilities: ${s.coverage.uniqueFacilities}; under construction excluded: ${s.totals.excludedUnderConstruction}; unresolved: ${s.totals.unresolvedFacilities}.`,
  `City coverage: ${s.coverage.observedCities}/${s.coverage.referenceCities} referenced cities. Missing/unknown: ${s.coverage.missingCities.join(', ')||'none'}.`,``,
  `| Owner | Classification | Facilities | Jobs | Flats | Area |`,`| --- | --- | ---: | ---: | ---: | ---: |`,
  ...s.byOwner.map(o=>`| ${(o.name??o.uid).replaceAll('|','/')} | ${o.classification.group} | ${o.total.facilities} | ${o.total.jobs} | ${o.total.flats} | ${o.total.area} |`),``,
  `Plans are separate from observed construction. Historical or manually supplied foreign inventory must carry its own date and evidence.`,
  `Every physical facility has source references and a recorded contribution decision. Transfers do not create or delete physical facilities.`,
  `Source and catalog hashes permit offline reproduction without another API run. Income generation dates remain unknown.`,``,
  `Snapshot hash: ${s.contentSha256}`,``].join('\n');
}
export function verifySnapshot(snapshot){
 const {contentSha256,...body}=snapshot;
 if(snapshot.schemaVersion!==1||snapshot.kind!=='planet_reconciliation_snapshot'||hash(body)!==contentSha256)throw Error('snapshot-integrity');
 const ids=snapshot.facilities.map(f=>f.uid);if(ids.length!==new Set(ids).size)throw Error('snapshot-duplicate');return snapshot;
}
export function compareSnapshots(before,after){
 verifySnapshot(before);verifySnapshot(after);if(before.planet.uid!==after.planet.uid)throw Error('different-planets');
 const a=new Map(before.facilities.map(f=>[f.uid,f])),b=new Map(after.facilities.map(f=>[f.uid,f]));
 const added=[],noLongerObserved=[],transferred=[],constructionCompleted=[],otherStateChanges=[];
 for(const [id,current]of b){const previous=a.get(id);if(!previous){added.push(id);continue;}
  if(previous.ownerUid!==current.ownerUid)transferred.push({uid:id,from:previous.ownerUid,to:current.ownerUid});
  if(previous.underConstruction===true&&current.underConstruction===false)constructionCompleted.push(id);
  for(const field of ['cityUid','x','y','orientation','wrecked'])if(previous[field]!==current[field])otherStateChanges.push({uid:id,field,before:previous[field],after:current[field]});
 }
 for(const id of a.keys())if(!b.has(id))noLongerObserved.push(id);
 return {schemaVersion:1,planetUid:before.planet.uid,before:before.snapshotId,after:after.snapshotId,added,noLongerObserved,transferred,constructionCompleted,otherStateChanges,
  totals:{before:before.totals.includedCompleted,after:after.totals.includedCompleted},
  caveat:'No longer observed does not prove demolition; inspect source coverage and conflicts.'};
}
