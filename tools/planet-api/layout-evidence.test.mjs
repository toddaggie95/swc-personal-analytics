import test from'node:test';import assert from'node:assert/strict';import{parseObservedLayout,learnCrosswalk,layoutSupplement}from'./layout-evidence.mjs';
test('crosswalk is learned from position and source, including nonmatching API and Designer numbers',()=>{
 const c=learnCrosswalk([{uid:'7:1',layout:'77,0,0,v;'}],[{cityUid:'7:1',x:1,y:1,typeUid:'4:9',source:'independent named building'}]);
 assert.equal(c.types[0].designerId,77);assert.equal(c.types[0].typeUid,'4:9');
 const s={planet:{uid:'8:1'},catalog:[{uid:'4:9'}],facilities:[{uid:'4:100',cityUid:'7:1',x:1,y:1,typeUid:null}]};
 const r=layoutSupplement(s,[{uid:'7:1',status:'observed',data:{layout:'77,0,0,v;'},source:{id:'api',observedAt:'2026-11-16T00:00:00Z'}}],c);
 assert.equal(r.sources[0].facilities[0].typeUid,'4:9');assert.equal(r.sources[0].facilities[0].underConstruction,undefined);
});
test('duplicate anchors, malformed layout, inconsistent mappings and tampered evidence are rejected',()=>{
 assert.throws(()=>parseObservedLayout('1,0,0,v;2,0,0,h;'));assert.throws(()=>parseObservedLayout('not code'));
 assert.throws(()=>learnCrosswalk([{uid:'7:1',layout:'7,0,0,v;7,3,3,v;'}],[{cityUid:'7:1',x:1,y:1,typeUid:'4:9',source:'a'},{cityUid:'7:1',x:4,y:4,typeUid:'4:10',source:'b'}]));
 assert.throws(()=>layoutSupplement({},{},{contentSha256:'wrong'}));
});
test('missing and contradictory layout coverage produces gaps rather than a guessed type',()=>{
 const c=learnCrosswalk([{uid:'7:1',layout:'1,0,0,v;'}],[{cityUid:'7:1',x:1,y:1,typeUid:'4:9',source:'a'}]);
 const s={planet:{uid:'8:1'},catalog:[{uid:'4:9'}],facilities:[{uid:'4:100',cityUid:'7:1',x:1,y:1,typeUid:'4:10'}]};
 const r=layoutSupplement(s,[{uid:'7:1',status:'observed',data:{layout:'1,0,0,v;'},source:{id:'a'}}],c);assert.equal(r.sources.length,0);assert.equal(r.gaps[0].code,'known_type_conflicts_with_layout');
});
