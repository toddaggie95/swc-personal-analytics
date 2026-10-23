import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewByTags} from './review-overlaps.mjs';
const hub=(id,title)=>({id,title,candidateStationUids:['5:1']});
const station=tags=>[{uid:'5:1',system:'Tholatin',sysX:'10',sysY:'15',tags}];
test('unique tag identifies VIII ring despite two geometric candidates',()=>{
 const r=reviewByTags(station('TFF Tholatin VIII Ring'),[hub('iv','TFF Tholation IV Ring (2/2) (10,14)'),hub('viii','TFF Tholatin VIII Ring (10,16)')]);
 assert.equal(r[0].proposedId,'viii');
});
test('split ring tag cannot select between 1/2 and 2/2',()=>{
 const r=reviewByTags(station('TFF Tholation IV Ring'),[hub('one','TFF Tholation IV Ring (1/2) (9,12)'),hub('two','TFF Tholation IV Ring (2/2) (10,14)')]);
 assert.equal(r[0].proposedId,null);assert.equal(r[0].evidence,'ambiguous-tag');
});
test('untagged station remains unresolved',()=>{
 const r=reviewByTags(station(''),[hub('a','Hub (5,15)'),hub('b','Hub (4,17)')]);
 assert.equal(r[0].proposedId,null);
});
