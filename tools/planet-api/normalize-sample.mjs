// Offline adapter: observations are not a completed planetary inventory or income cycle.
import {createHash} from 'node:crypto';
import {record,uid,unwrap,validatePage} from './capability-pilot.mjs';
export function normalizeFacilitySample(capture,{planetUid,ownerUid,runId}){
 const body=typeof capture.body==='string'?JSON.parse(capture.body):capture.body;
 const page=validatePage(unwrap(body),planetUid,ownerUid,'4');
 const sourceHash=createHash('sha256').update(JSON.stringify(body)).digest('hex');
 return {schemaVersion:1,runId,observedAt:capture.observedAt,sourceHash,planetUid,ownerUid,
  coverage:{observed:page.returned,reportedOwnedTotal:page.total,completeOwned:page.complete,allOwners:false},
  facilities:page.rows.map(row=>({
   uid:uid(row),typeUid:uid(row.type)??null,ownerUid:uid(row.owner),
   managerUid:uid(row.commander)??null,operatorUid:uid(row.pilot)??null,
   cityUid:uid(record(row.location).city)??null,planetUid:uid(record(row.location).planet),
   ground:record(record(row.location).coordinates).ground??null,
   orientation:row.orientation??null,underConstruction:row.underconstruction??null,
   powered:row.ispowered??null,generatorEnergyRemaining:row.energyremaining??null,
   openTo:row.opento??null,incomeObservation:row.facilityincome??null,
   incomeGeneratedAt:null,operatorTradeSkillAtGeneration:null,
   missingPolicy:'null means unobserved, not zero; no collection-time eligibility inferred',
  }))};
}
