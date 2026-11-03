import test from 'node:test';
import assert from 'node:assert/strict';
import {coverage,assessCoverage} from './operation-coverage.mjs';
test('null operations are unknown, not idle',()=>{
 const result=coverage([{operations:{productionActions:null,tooledTo:null,queueItems:null}}]);
 assert.equal(result.unknown.productionActions,1);
 assert.equal(assessCoverage({tff:[{typeName:'Shipyard I',operations:{productionActions:null}}]}).status,'blocked_incomplete_operations');
});
test('empty explicit arrays count as known observations',()=>{
 const result=assessCoverage({tjo:[{typeName:'Shipyard I',operations:{productionActions:[],tooledTo:{},queueItems:[]}}]});
 assert.equal(result.status,'complete');
});

test('non-production stations do not block shipyard readiness coverage',()=>{
 const result=assessCoverage({tff:[{typeName:'Golan II',operations:{productionActions:null}}],tjo:[{typeName:'Depot Station I',operations:{productionActions:null}}]});
 assert.equal(result.status,'complete');
 assert.equal(result.results.tff.excludedNonShipyards,1);
});
