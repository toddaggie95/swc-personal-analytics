import test from'node:test';import assert from'node:assert/strict';import{accountTypeCounts}from'./planet-accounting.mjs';
const cat=[{uid:'4:1',name:'Hotel',jobs:10,flats:5,area:3,economicFieldsComplete:true},{uid:'4:2',name:'Palace',jobs:100,flats:10,area:49,economicFieldsComplete:true}];
const rows=[{typeUid:'4:1',count:1,layer:'actual'},{typeUid:'4:2',count:2,layer:'actual'}];
test('published classification and independently computed jobs/flats/area/crime are conserved',()=>{
 const r=accountTypeCounts(rows,cat,{slabs:4,taxFraction:0});assert.deepEqual(r.totals,{facilities:3,jobs:210,flats:25,area:101});assert.equal(r.groupAreas.s1,3);assert.equal(r.groupAreas.s2,98);
 assert.equal(r.derived.civilisationFraction,101/1936);assert.ok(Math.abs(r.derived.finalCrimeFraction-(3/1936/0.83*0.96))<1e-15);
 assert.equal(r.derived.predictedPopulation,(Math.log(25)*625+25)*1.15);
});
test('reservations and proposals cannot change reconciliation totals or classification areas',()=>{
 const a=accountTypeCounts(rows,cat,{slabs:4,taxFraction:0}),b=accountTypeCounts([...rows,{typeUid:'4:2',count:100,layer:'reservation'}],cat,{slabs:4,taxFraction:0});assert.deepEqual(a.totals,b.totals);assert.deepEqual(a.groupAreas,b.groupAreas);assert.equal(b.excludedNonActualRows.length,1);
});
test('unknown metadata and undefined denominators are explicit rather than invented zeros',()=>{
 const r=accountTypeCounts([{typeUid:'4:99',count:2,layer:'actual'}],cat,{slabs:1,taxFraction:0});assert.equal(r.unknownTypes.length,1);assert.equal(r.derived.baseCrimeFraction,null);assert.equal(r.derived.basePopulation,null);
});
test('tax branches, invalid counts and absent explicit tax are handled without implicit assumptions',()=>{
 assert.ok(Math.abs(accountTypeCounts(rows,cat,{slabs:4,taxFraction:0.05}).derived.populationModifier-1)<1e-14);
 assert.equal(accountTypeCounts(rows,cat,{slabs:4,taxFraction:0.1}).derived.populationModifier,0.9600000000000001);
 assert.throws(()=>accountTypeCounts(rows,cat,{slabs:4}));assert.throws(()=>accountTypeCounts([...rows,rows[0]],cat,{slabs:4,taxFraction:0}));
});
