import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFacilitySample} from './normalize-sample.mjs';
test('offline normalization retains zero income but never invents generation time or absent power',()=>{
 const ref=uid=>({attributes:{uid}});
 const capture={observedAt:'2026-11-15T00:00:00Z',body:{swcapi:{entities:{attributes:{total:2,start:1,count:1},entity:[
  {value:{uid:'4:1',owner:ref('20:1'),location:{planet:ref('8:1'),city:ref('7:2')},facilityincome:{income:0},energyremaining:0}}
 ]}}}};
 const result=normalizeFacilitySample(capture,{planetUid:'8:1',ownerUid:'20:1',runId:'test'});
 assert.equal(result.coverage.completeOwned,false);assert.equal(result.coverage.allOwners,false);
 assert.equal(result.facilities[0].incomeObservation.income,0);
 assert.equal(result.facilities[0].generatorEnergyRemaining,0);
 assert.equal(result.facilities[0].powered,null);
 assert.equal(result.facilities[0].incomeGeneratedAt,null);
 assert.equal(result.facilities[0].operatorTradeSkillAtGeneration,null);
 assert.equal(result.facilities[0].cityUid,'7:2');assert.match(result.sourceHash,/^[a-f0-9]{64}$/);
});
