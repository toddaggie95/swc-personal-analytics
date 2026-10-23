import test from 'node:test';
import assert from 'node:assert/strict';
import {matchAmbiguousStationByHas} from './resolve-ambiguous.mjs';
const mats=['quantum','meleenium','duracrete'];
const p=[{type_name:'quantum',quantity:'9385'},{type_name:'meleenium',quantity:'54479'},{type_name:'duracrete',quantity:'57802'}];
const a={id:'Tholatin-IV-1',totals:{quantum:9385,meleenium:54479,duracrete:57802}};
const b={id:'Tholatin-IV-2',totals:{quantum:0,meleenium:0,duracrete:0}};
test('material-bearing ambiguous station resolves only to unique exact HAS vector',()=>{
 const r=matchAmbiguousStationByHas(p,[a,b],mats);assert.equal(r.resolved,a.id);
});
test('zero inventory against two empty hubs remains ambiguous',()=>{
 const r=matchAmbiguousStationByHas([],[{...a,totals:b.totals},b],mats);
 assert.equal(r.resolved,null);assert.equal(r.reason,'multiple-full-vector-matches');
});
test('partial or mismatched inventory never auto resolves',()=>{
 const r=matchAmbiguousStationByHas(p,[{...a,totals:{...a.totals,meleenium:54480}},b],mats);
 assert.equal(r.resolved,null);assert.equal(r.reason,'no-full-vector-match');
});
