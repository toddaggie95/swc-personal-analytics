import test from 'node:test';
import assert from 'node:assert/strict';
import {coverage,assessCoverage,compareIdleSemantics} from './operation-coverage.mjs';
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

test('UID-level running and blank action parity, independent of row order',()=>{
 const web=[{uid:'5:1',productionStatus:''},{uid:'5:2',productionStatus:'running'}];
 const api=[{uid:'5:2',typeName:'Shipyard',operations:{productionActions:[{value:{status:'running'}}]}},{uid:'5:1',typeName:'Shipyard',operations:{productionActions:null}}];
 const result=compareIdleSemantics(web,api);
 assert.equal(result.status,'matched');assert.equal(result.shipyardsRunning,1);assert.equal(result.shipyardsWebBlank,1);
 assert.equal(compareIdleSemantics(web,[{...api[0],operations:{productionActions:[]}},api[1]]).status,'differences');
 assert.equal(compareIdleSemantics(web,api.slice(0,1)).status,'differences');
 assert.throws(()=>compareIdleSemantics([...web,web[0]],api),/Duplicate/);
});
