import test from'node:test';import assert from'node:assert/strict';import{incomeEvidence}from'./income-evidence.mjs';
import{hash}from'./planet-capture.mjs';
const ref=uid=>({attributes:{uid}});
const seal=(s,i)=>{Object.assign(s,{schemaVersion:1,kind:'planet_reconciliation_snapshot',provenance:{inventoryHash:hash(i)}});s.contentSha256=hash(s);return s;};
test('income retains zero, debt and distinct manager/owner while preserving missing generation state',()=>{
 const f={uid:'4:1',ownerUid:'20:1',typeUid:'4:9',underConstruction:false,wrecked:false,observations:[]};
 const s={planet:{uid:'8:1'},facilities:[f,{...f,uid:'4:2'}],observationWindow:{from:'2026-11-16'}};
 const inventory={planet:{uid:'8:1'},inventories:[{kind:'facilities',status:'complete',sources:[{id:'source'}],rows:[{uid:'4:1',owner:ref('20:1'),commander:ref('20:2'),pilot:ref('1:3'),opento:'All',ispowered:'yes',facilityincome:{income:0,currentdebt:10,paiddebt:4,warnings:0}}]}]};
 const r=incomeEvidence(seal(s,inventory),inventory);assert.equal(r.records[0].managerUid,'20:2');assert.equal(r.records[0].ownerUid,'20:1');assert.equal(r.records[0].reportedIncome,0);assert.equal(r.records[1].reportedIncome,null);assert.equal(r.records[0].generatedAt,null);assert.equal(r.records[0].eligibilityGates.operatorActiveAtGeneration,null);assert.equal(r.byType[0].zero,1);
});
test('descriptive medians use actual sorted observations and blank values remain absent',()=>{
 const facilities=[1,2,3,4].map(n=>({uid:'4:'+n,typeUid:'4:9',observations:[],incomeObservation:{income:[1,2,100,''][n-1]}}));
 const i={planet:{uid:'8:1'},inventories:[]};const r=incomeEvidence(seal({planet:{uid:'8:1'},facilities},i),i);assert.equal(r.byType[0].median,2);assert.equal(r.byType[0].count,3);assert.equal(r.records[3].reportedIncome,null);
});
