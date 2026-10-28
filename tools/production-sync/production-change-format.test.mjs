import test from 'node:test';
import assert from 'node:assert/strict';
import {formatProductionChanges} from './production-change-format.mjs';
test('formats empty comparisons without false alerts',()=>{
 const output=formatProductionChanges({status:'compared',previousBatch:'a',currentBatch:'b',previousCount:2,currentCount:2,changes:[]});
 assert.match(output,/No changes detected/);
});
test('groups multiple station changes by system',()=>{
 const output=formatProductionChanges({status:'compared',previousBatch:'a',currentBatch:'b',previousCount:2,currentCount:2,changes:[{uid:'123',system:'Kashyyyk',type:'production_activity_changed',before:false,after:true},{uid:'123',system:'Kashyyyk',type:'readiness_changed',before:'blocked',after:'building'}]});
 assert.match(output,/\[Kashyyyk\]/);
 assert.match(output,/123 \| production_activity_changed \| false -> true/);
 assert.match(output,/123 \| readiness_changed \| blocked -> building/);
});
