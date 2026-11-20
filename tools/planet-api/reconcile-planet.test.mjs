import test from 'node:test';import assert from 'node:assert/strict';
import {hash} from './planet-capture.mjs';import{reconcilePlanet,reconcileFleet}from'./reconcile-planet.mjs';
const src=(id='web',currency='current')=>({id,currency,reference:'synthetic evidence',observedAt:'2026-11-16T00:00:00Z'});
function fixture(){
 const s={schemaVersion:1,kind:'planet_reconciliation_snapshot',planet:{uid:'8:1',name:'Synthetic',publicControls:{size:2}},
  coverage:{missingCities:[],uniqueFacilities:3,allPhysicalPlanetVerified:false},
  catalog:[{uid:'4:1',economicFieldsComplete:true,jobs:0.2,flats:1,area:1},{uid:'4:2',economicFieldsComplete:true,jobs:100,flats:10,area:49}],
  facilities:[{uid:'4:100',name:'Home',cityUid:'7:1',x:1,y:1,typeUid:'4:1',ownerUid:'20:1',underConstruction:false,wrecked:false,incomeObservation:{income:0}},
   {uid:'4:200',name:'Palace',cityUid:'7:1',x:4,y:4,typeUid:null,ownerUid:null,underConstruction:null,wrecked:null},
   {uid:'4:300',name:'Planned-in-progress',typeUid:'4:2',ownerUid:'20:1',underConstruction:true,wrecked:false,incomeObservation:{income:8}}]};
 s.contentSha256=hash(s);return s;
}
const evidence=facilities=>({schemaVersion:1,planetUid:'8:1',sources:[{source:src(),facilities}]});
test('immutable UID enrichment deduplicates a redacted city reference and conserves fractional jobs',()=>{
 const s=fixture(),original=JSON.stringify(s);const r=reconcilePlanet(s,evidence([{uid:'4:200',layer:'actual',typeUid:'4:2',ownerUid:'20:2',underConstruction:false,wrecked:false}]));
 assert.deepEqual(r.actualStateTotals,{facilities:2,jobs:100.2,flats:11,area:50});assert.equal(r.facilities.length,3);assert.equal(r.underConstruction.length,1);assert.equal(JSON.stringify(s),original);assert.equal(r.status,'pending_current_controls');
});
test('reservations and proposed buildings never enter physical totals',()=>{
 const r=reconcilePlanet(fixture(),evidence([{uid:'4:900',layer:'reservation',typeUid:'4:2',underConstruction:false},{uid:'4:901',layer:'planned',typeUid:'4:2',underConstruction:false}]));
 assert.equal(r.actualStateTotals.jobs,0.2);assert.equal(r.facilities.length,3);assert.equal(r.excludedNonActualEvidence.length,2);
});
test('historical observations and all-owner aggregates are comparisons, never additive inventories',()=>{
 const r=reconcilePlanet(fixture(),{schemaVersion:1,sources:[{source:src('old','historical'),facilities:[{uid:'4:200',layer:'actual',typeUid:'4:2',underConstruction:false}],aggregate:{scope:'all physical owners',byType:[{typeUid:'4:2',count:9}]}}]});
 assert.equal(r.actualStateTotals.jobs,0.2);assert.equal(r.aggregateComparisons[1].difference,-9);assert.equal(r.appliedSupplements.length,0);
});
test('known identity and state conflicts are reported without silently selecting an owner',()=>{
 const r=reconcilePlanet(fixture(),evidence([{uid:'4:100',layer:'actual',ownerUid:'20:9',underConstruction:true}]));assert.equal(r.status,'conflicting_evidence');assert.equal(r.facilities[0].ownerUid,'20:1');assert.equal(r.discrepancies[0].fields.length,2);
});
test('position matching requires an exact normalized name and unique city-position candidate',()=>{
 let r=reconcilePlanet(fixture(),evidence([{layer:'actual',cityUid:'7:1',x:4,y:4,name:'Pa lace',typeUid:'4:2'}]));assert.equal(r.appliedSupplements.length,1);
 r=reconcilePlanet(fixture(),evidence([{layer:'actual',cityUid:'7:1',x:4,y:4,name:'Different',typeUid:'4:2'}]));assert.equal(r.unmatchedEvidence.length,1);
});
test('a powered field alone does not invent a completion or wrecked state',()=>{
 const r=reconcilePlanet(fixture(),evidence([{uid:'4:200',layer:'actual',typeUid:'4:2',ownerUid:'20:2',powered:true}]));assert.equal(r.unresolvedFacilities.length,1);assert.equal(r.actualStateTotals.facilities,1);
});
test('historical exact controls do not certify a current baseline; current tolerance is explicit',()=>{
 const s=fixture();s.facilities=s.facilities.filter(f=>f.uid!=='4:200');delete s.contentSha256;s.contentSha256=hash(s);
 const sources=[{source:src('old','historical'),controls:[{field:'jobs',value:0.2,units:'jobs',tolerance:0},{field:'flats',value:1,units:'flats',tolerance:0}]}];
 assert.equal(reconcilePlanet(s,{schemaVersion:1,sources}).status,'pending_current_controls');
 sources[0].source=src();const r=reconcilePlanet(s,{schemaVersion:1,sources});assert.equal(r.status,'observed_controls_matched');assert.equal(r.optimizationReady,false);assert.equal(r.coverage.allPhysicalPlanetVerified,false);
 sources[0].controls[0].value=1;assert.equal(reconcilePlanet(s,{schemaVersion:1,sources}).status,'control_mismatch');
});
test('zero reported income is retained and missing generation epochs stay unknown',()=>{
 const r=reconcilePlanet(fixture());assert.equal(r.incomeObservations.zeroRecords,1);assert.equal(r.incomeObservations.reportedRecords,2);assert.equal(r.incomeObservations.knownGenerationTimes,0);assert.equal(r.incomeObservations.absentRecords,1);
});
test('bad provenance, cross-planet evidence, duplicates and percentage/fraction confusion cannot certify',()=>{
 assert.throws(()=>reconcilePlanet(fixture(),{schemaVersion:1,sources:[{source:{id:'missing'}}]}));
 assert.throws(()=>reconcilePlanet(fixture(),{schemaVersion:1,planetUid:'8:2',sources:[]}));
 assert.throws(()=>reconcilePlanet(fixture(),evidence([{uid:'4:100',layer:'actual'},{uid:'4:100',layer:'actual'}])));
 assert.throws(()=>reconcilePlanet(fixture(),{schemaVersion:1,sources:[{source:src(),controls:[{field:'civilisationFraction',value:35,units:'percent',tolerance:0.1}]}]}));
});
test('registry retains independent per-planet statuses and rejects duplicate snapshots',()=>{
 const s=fixture();assert.equal(reconcileFleet([s]).planets[0].status,'incomplete_coverage');assert.throws(()=>reconcileFleet([s,s]));
});
