import{record,uid}from'./capability-pilot.mjs';import{hash}from'./planet-capture.mjs';
import{verifySnapshot}from'./planet-snapshot.mjs';
const flag=v=>v===true||['yes','1','true'].includes(String(v).toLowerCase())?true:v===false||['no','0','false'].includes(String(v).toLowerCase())?false:null;
const number=v=>v!=null&&String(v).trim()&&Number.isFinite(Number(v))?Number(v):null;
export function incomeEvidence(snapshot,inventory){
 verifySnapshot(snapshot);if(hash(inventory)!==snapshot.provenance.inventoryHash)throw Error('income-inventory-provenance');
 if(snapshot.planet.uid!==uid(inventory.planet))throw Error('income-planet');
 const raw=new Map(),conflicts=[];
 for(const doc of inventory.inventories.filter(d=>d.kind==='facilities'&&d.status==='complete'))for(const row of doc.rows){
  if(raw.has(uid(row)))throw Error('income-duplicate');raw.set(uid(row),{row,sourceIds:doc.sources.map(s=>s.id)});
 }
 const records=[];
 for(const f of snapshot.facilities){
  const item=raw.get(f.uid),row=item?.row;
  const observation=row?.facilityincome??f.incomeObservation;
  const reported=number(observation?.income);
  const managerUid=uid(row?.commander)??f.managerUid??null,operatorUid=uid(row?.pilot)??f.operatorUid??null;
  const openTo=row?.opento??null,powered=row?flag(row.ispowered):f.powered;
  const gates={powered,openToAll:openTo==null?null:String(openTo).toLowerCase()==='all',managerAssigned:managerUid!==null,operatorAssigned:operatorUid!==null,
   managerActiveAtGeneration:null,operatorActiveAtGeneration:null,operatorTradeSkillAtGeneration:null,restrictedManagerFactionTypeEligible:null};
  records.push({uid:f.uid,typeUid:f.typeUid,ownerUid:f.ownerUid,managerUid,operatorUid,openTo,powered,poweredBy:row?.poweredby??null,
   underConstruction:f.underConstruction,wrecked:f.wrecked,reportedIncome:reported,currentDebt:number(observation?.currentdebt),paidDebt:number(observation?.paiddebt),warnings:observation?.warnings??null,
   generatedAt:null,observedWindow:snapshot.observationWindow,rawRecordSha256:row?hash(row):null,sourceIds:item?.sourceIds??f.observations.flatMap(o=>o.sourceIds),
   eligibilityGates:gates,generationEligibility:'not_established',beneficiaryBasis:'Current manager is recorded separately from owner; neither establishes the manager at payout generation.'});
 }
 const byType=new Map(),byCurrentManager=new Map();
 for(const r of records){
  if(r.reportedIncome==null)continue;
  if(!byType.has(r.typeUid))byType.set(r.typeUid,[]);byType.get(r.typeUid).push(r.reportedIncome);
  const k=r.managerUid??'unknown';if(!byCurrentManager.has(k))byCurrentManager.set(k,{managerUid:k,reportedRecords:0,totalReported:0});
  const m=byCurrentManager.get(k);m.reportedRecords++;m.totalReported+=r.reportedIncome;
 }
 const statistics=values=>{const sorted=[...values].sort((a,b)=>a-b),n=sorted.length,mean=sorted.reduce((a,b)=>a+b,0)/n;return{count:n,positive:sorted.filter(n=>n>0).length,zero:sorted.filter(n=>n===0).length,negative:sorted.filter(n=>n<0).length,min:sorted[0],max:sorted.at(-1),mean,median:n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2,sampleStandardDeviation:n>1?Math.sqrt(sorted.reduce((a,b)=>a+(b-mean)**2,0)/(n-1)):null};};
 const result={schemaVersion:1,kind:'income_observation_evidence',parentSnapshotSha256:snapshot.contentSha256,planetUid:snapshot.planet.uid,records,
  byType:[...byType].map(([typeUid,values])=>({typeUid,...statistics(values)})),byCurrentManager:[...byCurrentManager.values()],conflicts,
  limitations:['Absent income is unknown, not zero.','Income values may belong to different unknown generation epochs.','Current ownership, manager, operator and power do not establish historical eligibility.','Descriptive distribution statistics are observations, not fitted FIM/MNSF constants or forecasts.','Reported totals are not certified current-week cash receipts.']};
 result.contentSha256=hash(result);return result;
}
