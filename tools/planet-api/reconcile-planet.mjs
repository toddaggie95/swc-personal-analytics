// Offline reconciliation only: immutable observations, sourced supplements and discrepancies.
import {verifySnapshot} from './planet-snapshot.mjs';
import {hash} from './planet-capture.mjs';
const normalized=s=>String(s??'').replace(/\s+/g,'').toLowerCase();
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const uid=(v,p)=>typeof v==='string'&&new RegExp('^'+p+':\\d+$').test(v);
const actualFields=['typeUid','ownerUid','cityUid','x','y','orientation','underConstruction','wrecked','powered'];
function source(s){
 if(!s||!s.id||!s.reference||!['current','historical','user_observation'].includes(s.currency)||
   s.currency==='current'&&!Number.isFinite(Date.parse(s.observedAt)))throw Error('evidence-provenance');
 return structuredClone(s);
}
function economicRecord(f,catalog){
 const t=catalog.get(f.typeUid);let reason=null;
 if(f.underConstruction===true)reason='under_construction';else if(f.wrecked===true)reason='wrecked_rule_unverified';
 else if(f.underConstruction!==false)reason='unknown_construction_state';else if(f.wrecked!==false)reason='unknown_wrecked_state';
 else if(!t?.economicFieldsComplete)reason='missing_type_economics';
 return reason?{included:false,reason}:{included:true,jobs:t.jobs,flats:t.flats,area:t.area};
}
export function reconcilePlanet(snapshot,evidence={schemaVersion:1,sources:[]}){
 verifySnapshot(snapshot);
 if(evidence.schemaVersion!==1||evidence.planetUid&&evidence.planetUid!==snapshot.planet.uid||!Array.isArray(evidence.sources))throw Error('evidence-contract');
 const facilities=new Map(snapshot.facilities.map(f=>[f.uid,structuredClone(f)]));
 const catalog=new Map(snapshot.catalog.map(t=>[t.uid,t]));
 const discrepancies=[],applied=[],excluded=[],unmatched=[],historicalComparisons=[],controls=[];
 const seenSources=new Set();
 for(const package_ of evidence.sources){
  const s=source(package_.source);if(seenSources.has(s.id))throw Error('duplicate-evidence-source');seenSources.add(s.id);
  const seenRows=new Set();
  for(const [i,row]of (package_.facilities??[]).entries()){
   const ref={sourceId:s.id,row:i+1};
   if(row.layer!=='actual'){excluded.push({...ref,reason:'not_actual_observation'});continue;}
   if(row.planetUid&&row.planetUid!==snapshot.planet.uid){discrepancies.push({...ref,code:'foreign_planet'});continue;}
   if(row.uid&&!uid(row.uid,4))throw Error('facility-uid');
   let candidates;
   if(row.uid)candidates=facilities.has(row.uid)?[facilities.get(row.uid)]:[];
   else if(uid(row.cityUid,7)&&numeric(row.x)&&numeric(row.y)&&row.name)candidates=[...facilities.values()].filter(f=>f.cityUid===row.cityUid&&f.x===row.x&&f.y===row.y&&normalized(f.name)===normalized(row.name));
   else candidates=[];
   if(candidates.length!==1){unmatched.push({...ref,uid:row.uid??null,candidates:candidates.map(f=>f.uid),reason:candidates.length?'ambiguous_identity':'no_unique_identity'});continue;}
   const f=candidates[0];if(seenRows.has(f.uid))throw Error('duplicate-evidence-facility');seenRows.add(f.uid);
   if(s.currency==='historical'){historicalComparisons.push({...ref,uid:f.uid,status:'retained_historical_not_overlaid'});continue;}
   if(row.typeUid&&!uid(row.typeUid,4)||row.ownerUid&&!uid(row.ownerUid,20)&&!uid(row.ownerUid,1))throw Error('supplement-identity');
   for(const key of ['underConstruction','wrecked','powered'])if(row[key]!=null&&typeof row[key]!=='boolean')throw Error('supplement-state');
   const conflicts=actualFields.filter(k=>row[k]!=null&&f[k]!=null&&row[k]!==f[k]);
   if(row.name&&normalized(row.name)!==normalized(f.name))conflicts.push('name');
   if(conflicts.length){discrepancies.push({...ref,uid:f.uid,code:'observation_conflict',fields:conflicts.map(k=>({field:k,api:f[k],evidence:row[k]}))});continue;}
   const fields=[];
   for(const key of actualFields)if(f[key]==null&&row[key]!=null){f[key]=row[key];fields.push(key);}
   if(fields.length){f.reconciliationEvidence??=[];f.reconciliationEvidence.push({...ref,fields,source:s});applied.push({...ref,uid:f.uid,fields});}
  }
  // An aggregate never becomes a second inventory. Keep signed differences by type.
  if(package_.aggregate){
   const a=package_.aggregate;if(!a.scope||!Array.isArray(a.byType))throw Error('aggregate-scope');
   const seen=new Set();for(const r of a.byType){if(!uid(r.typeUid,4)||seen.has(r.typeUid)||!Number.isSafeInteger(r.count)||r.count<0)throw Error('aggregate-type');seen.add(r.typeUid);
    const count=[...facilities.values()].filter(f=>f.typeUid===r.typeUid&&(!a.ownerUids||a.ownerUids.includes(f.ownerUid))&&f.underConstruction===false&&f.wrecked===false).length;
    historicalComparisons.push({sourceId:s.id,typeUid:r.typeUid,scope:a.scope,ownerUids:a.ownerUids??null,sourceCount:r.count,observedKnownCompleted:count,difference:count-r.count,currency:s.currency,neverAddedToInventory:true});
   }
  }
  for(const control of package_.controls??[]){
   if(!['jobs','flats','employmentRate','civilisationFraction','area'].includes(control.field)||!numeric(control.value)||control.value<0||!numeric(control.tolerance)||control.tolerance<0||!control.units)throw Error('control-contract');
   if(['civilisationFraction'].includes(control.field)&&control.units!=='fraction')throw Error('control-units');
   controls.push({...control,source:s});
  }
 }
 const totals={facilities:0,jobs:0,flats:0,area:0},owners=new Map(),unresolved=[],underConstruction=[];
 let microjobs=0;
 for(const f of facilities.values()){
  f.reconciledContribution=economicRecord(f,catalog);
  if(!f.reconciledContribution.included){(f.reconciledContribution.reason==='under_construction'?underConstruction:unresolved).push({uid:f.uid,reason:f.reconciledContribution.reason});continue;}
  const c=f.reconciledContribution;totals.facilities++;microjobs+=Math.round(c.jobs*1e6);totals.flats+=c.flats;totals.area+=c.area;
  const k=f.ownerUid??'unknown';if(!owners.has(k))owners.set(k,{uid:k,facilities:0,jobsMicrounits:0,flats:0,area:0});
  const o=owners.get(k);o.facilities++;o.jobsMicrounits+=Math.round(c.jobs*1e6);o.flats+=c.flats;o.area+=c.area;
 }
 totals.jobs=microjobs/1e6;
 const size=Number(snapshot.planet.publicControls.size),derived={employmentRate:totals.jobs/(totals.flats+0.1),civilisationFraction:Number.isSafeInteger(size)&&size>0?totals.area/(size*size*484):null};
 const comparisons=controls.map(c=>{const value=c.field in totals?totals[c.field]:derived[c.field];const difference=value==null?null:value-c.value;
  return {...c,observedKnownCompleted:value,difference,withinTolerance:difference!==null&&Math.abs(difference)<=c.tolerance+1e-10,currentIndependentControl:c.source.currency==='current'};});
 const currentChecks=comparisons.filter(c=>c.currentIndependentControl);
 const hasCoreControls=['jobs','flats'].every(f=>currentChecks.some(c=>c.field===f));
 const missingCities=snapshot.coverage.missingCities;
 const ownerGaps=snapshot.coverage.ownerInventories?.some(d=>d.status!=='complete');
 const status=discrepancies.length?'conflicting_evidence':unresolved.length||missingCities.length||ownerGaps?'incomplete_coverage':!hasCoreControls?'pending_current_controls':currentChecks.some(c=>!c.withinTolerance)?'control_mismatch':'observed_controls_matched';
 const income={reportedRecords:0,positiveRecords:0,zeroRecords:0,absentRecords:0,knownGenerationTimes:0,byType:[]},incomeTypes=new Map();
 for(const f of facilities.values()){
  const v=f.incomeObservation?.income;
  if(v==null||typeof v==='string'&&!v.trim()){income.absentRecords++;continue;}
  const n=Number(v);if(!Number.isFinite(n)){discrepancies.push({uid:f.uid,code:'invalid_income_observation'});continue;}
  income.reportedRecords++;if(n>0)income.positiveRecords++;else if(n===0)income.zeroRecords++;
  if(f.incomeGeneratedAt)income.knownGenerationTimes++;
  const k=f.typeUid??'unknown';if(!incomeTypes.has(k))incomeTypes.set(k,{typeUid:k,records:0,positiveRecords:0,totalReported:0});
  const t=incomeTypes.get(k);t.records++;if(n>0)t.positiveRecords++;t.totalReported+=n;
 }
 income.byType=[...incomeTypes.values()].map(t=>({...t,meanReported:t.totalReported/t.records}));
 const result={schemaVersion:1,kind:'planet_reconciliation_result',planet:snapshot.planet,parentSnapshotSha256:snapshot.contentSha256,evidenceSha256:hash(evidence),
  status:discrepancies.length?'conflicting_evidence':status,optimizationReady:false,coverage:{...snapshot.coverage,allPhysicalPlanetVerified:false},
  actualStateTotals:totals,derivedFromKnownCompleted:derived,byOwner:[...owners.values()].map(({jobsMicrounits,...o})=>({...o,jobs:jobsMicrounits/1e6})),
  appliedSupplements:applied,excludedNonActualEvidence:excluded,unmatchedEvidence:unmatched,discrepancies,unresolvedFacilities:unresolved,underConstruction,
  controlComparisons:comparisons,aggregateComparisons:historicalComparisons,incomeObservations:income,
  facilities:[...facilities.values()],notes:['Planning reservations and proposed builds are never physical observations.','Unmatched historical aggregates are not added to current facility UIDs.','Matching controls does not independently prove complete physical coverage.','Income observation time is not generation time; reported payouts are not a calibrated income model.']};
 result.contentSha256=hash(result);return result;
}
export function reconcileFleet(snapshots,evidenceByPlanet={}){
 const seen=new Set();const planets=snapshots.map(s=>{if(seen.has(s.planet.uid))throw Error('duplicate-planet');seen.add(s.planet.uid);return reconcilePlanet(s,evidenceByPlanet[s.planet.uid]);});
 return {schemaVersion:1,kind:'planet_reconciliation_registry',planets:planets.map(p=>({planetUid:p.planet.uid,name:p.planet.name,parentSnapshotSha256:p.parentSnapshotSha256,resultSha256:p.contentSha256,status:p.status,actualStateTotals:p.actualStateTotals,gaps:{missingCities:p.coverage.missingCities.length,unresolvedFacilities:p.unresolvedFacilities.length,discrepancies:p.discrepancies.length},optimizationReady:false})),results:planets};
}
export function reconciliationReport(r){
 return ['# Planet reconciliation: '+r.planet.name,'',`Status: ${r.status}. Optimization-ready: false.`,
 '',`Known completed: ${r.actualStateTotals.facilities} facilities; ${r.actualStateTotals.jobs} jobs; ${r.actualStateTotals.flats} flats; ${r.actualStateTotals.area} area.`,
 `Unresolved facilities: ${r.unresolvedFacilities.length}. Missing city details: ${r.coverage.missingCities.length}. Conflicts: ${r.discrepancies.length}.`,
 '',`Reported income records: ${r.incomeObservations.reportedRecords}; known generation times: ${r.incomeObservations.knownGenerationTimes}.`,
 '',...r.controlComparisons.map(c=>`${c.field}: known completed ${c.observedKnownCompleted}; ${c.source.currency} control ${c.value}; difference ${c.difference}; within tolerance ${c.withinTolerance}.`),
 '',...r.notes].join('\n')+'\n';
}
